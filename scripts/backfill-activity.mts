// Backfill the activity store with the last N days of token_swapped events.
//
//   pnpm activity:backfill --env ~/.claude/alloy-dashboard.env [--days 30]
//                          [--pool 3497] [--host https://lcd.archive.osmosis.zone]
//
// The env file (kept outside the repo) must provide the database URL, e.g. from
// `vercel env pull`. Walks each pool oldest-first in slices through the archive
// LCD (paced by fetchLcd), writing rows and 15-minute rollups idempotently.
// Progress is stored per pool (activity_cursor.backfill_from / backfill_to), so
// the script can be stopped and re-run to resume. A pool's covered_from is only
// lowered once its whole range is done, so reads never see a gap.
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"
import dotenv from "dotenv"

const { values: args } = parseArgs({
  options: {
    env: { type: "string" },
    days: { type: "string", default: "30" },
    pool: { type: "string", multiple: true },
    host: { type: "string", multiple: true },
    slice: { type: "string", default: "3600" },
  },
})
if (args.env) {
  dotenv.config({ path: args.env.replace(/^~(?=$|[\\/])/, os.homedir()) })
}

// Imported after the env is loaded: the database module reads it at import.
const { getPrisma, isDatabaseEnabled } = await import(
  pathToFileURL(path.resolve("src/lib/database.ts")).href
)
const {
  BLOCKS_PER_DAY,
  TX_OPTIONS,
  blockTime,
  fetchSwapEvents,
  latestHeight,
  writeEvents,
} = await import(
  pathToFileURL(path.resolve("src/services/activity-ingest.ts")).href
)

if (!isDatabaseEnabled()) {
  console.error("No database URL: pass --env with the store's connection URL.")
  process.exit(1)
}

const hosts = args.host?.length
  ? args.host
  : ["https://lcd.archive.osmosis.zone"]
const days = Number(args.days)
const slice = Number(args.slice)
const db = getPrisma()

const poolIds: string[] = args.pool?.length
  ? args.pool
  : await fetch("https://alloyed.osmosis.zone/api/pools")
      .then((r) => r.json())
      .then((pools: { id: string }[]) => pools.map((p) => p.id))

// Height at roughly `days` ago: estimate from the block rate, then correct
// once against the measured rate between that block and the tip.
const tip = await latestHeight(hosts)
const tipTime = await blockTime(tip, hosts)
const target = tipTime.getTime() - days * 86_400_000
let start = tip - days * BLOCKS_PER_DAY
const estimateTime = (await blockTime(start, hosts)).getTime()
const msPerBlock = (tipTime.getTime() - estimateTime) / (tip - start)
start = Math.round(start + (target - estimateTime) / msPerBlock)
const startTime = await blockTime(start, hosts)
console.log(
  `tip ${tip} (${tipTime.toISOString()}); ${days}d back = ${start} (${startTime.toISOString()}); pools ${poolIds.join(", ")}`
)

for (const poolId of poolIds) {
  let cursor = await db.activityCursor.findUnique({ where: { poolId } })
  if (!cursor) {
    // No live ingest yet: anchor the cursor at the tip so the cron continues
    // from exactly where this backfill ends.
    cursor = await db.activityCursor.create({
      data: { poolId, height: BigInt(tip), coveredFrom: tipTime },
    })
  }
  const end = Number(cursor.height)
  if (cursor.coveredFrom <= startTime) {
    console.log(
      `pool ${poolId}: already covered from ${cursor.coveredFrom.toISOString()}`
    )
    continue
  }
  // Resume a previous run over the same (or a wider) range.
  let from =
    cursor.backfillFrom !== null &&
    cursor.backfillTo !== null &&
    Number(cursor.backfillFrom) <= start
      ? Number(cursor.backfillTo)
      : start
  if (cursor.backfillFrom === null || Number(cursor.backfillFrom) > start) {
    await db.activityCursor.update({
      where: { poolId },
      data: { backfillFrom: BigInt(start), backfillTo: BigInt(start) },
    })
  }

  let rows = 0
  while (from < end) {
    const to = Math.min(from + slice, end)
    const { events, coveredTo } = await fetchSwapEvents({
      poolId,
      from,
      to,
      maxPages: 50,
      hosts,
    })
    if (coveredTo <= from) {
      throw new Error(`pool ${poolId}: no progress at ${from}; lower --slice`)
    }
    rows += await db.$transaction(async (tx: any) => {
      const added = await writeEvents(tx, poolId, events)
      await tx.activityCursor.update({
        where: { poolId },
        data: { backfillTo: BigInt(coveredTo) },
      })
      return added
    }, TX_OPTIONS)
    const pct = (((coveredTo - start) / (end - start)) * 100).toFixed(1)
    console.log(`pool ${poolId}: ${coveredTo}/${end} (${pct}%), ${rows} rows`)
    from = coveredTo
  }

  await db.activityCursor.update({
    where: { poolId },
    data: { coveredFrom: startTime },
  })
  console.log(`pool ${poolId}: done, covered from ${startTime.toISOString()}`)
}

await db.$disconnect()
