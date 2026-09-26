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
    // ~5h of blocks: early history is quieter, so larger slices mean fewer
    // requests; a busy slice just takes more pages.
    slice: { type: "string", default: "14400" },
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
  trimToBucketBoundary,
  writeEvents,
} = await import(
  pathToFileURL(path.resolve("src/services/activity-ingest.ts")).href
)
const { heightAtTime, poolContractAddress, poolLiquidityAt } = await import(
  pathToFileURL(path.resolve("src/services/reserves.ts")).href
)

if (!isDatabaseEnabled()) {
  console.error("No database URL: pass --env with the store's connection URL.")
  process.exit(1)
}

// The archive LCD occasionally returns 500s or drops a large page; ride those
// out with backoff instead of aborting a multi-hour run (progress is saved per
// slice, so a hard failure can also just be re-run).
const withBackoff = async <T,>(
  label: string,
  fn: () => Promise<T>
): Promise<T> => {
  const delays = [10_000, 30_000, 60_000, 120_000]
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      // Oversized responses fail the same way every time (see fetchSlice).
      if (attempt >= delays.length || String(e).includes("larger than max")) {
        throw e
      }
      console.warn(`${label}: ${e}; retrying in ${delays[attempt] / 1000}s`)
      await new Promise((r) => setTimeout(r, delays[attempt]))
    }
  }
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

const tip = await withBackoff("tip", () => latestHeight(hosts))
const tipTime = await withBackoff("tip time", () => blockTime(tip, hosts))
const chain = { height: tip, time: tipTime.getTime() }

// Height at `days` ago. Block times have varied a lot over Osmosis' history,
// so this uses the bracketed heightAtTime rather than one step at a constant
// rate, which lands months off that far back.
const target = new Date(tipTime.getTime() - days * 86_400_000)
const { height: start } = await withBackoff("start height", () =>
  heightAtTime(target, { tip: chain, hosts })
)
const startTime = await withBackoff("start time", () => blockTime(start, hosts))
console.log(
  `tip ${tip} (${tipTime.toISOString()}); ${days}d back = ${start} (${startTime.toISOString()}); pools ${poolIds.join(", ")}`
)

// Swap rows are only kept this long (the cron prunes the rest); older rows
// exist just to build their 15-minute rollups, so the backfill prunes them as
// it goes instead of holding a whole history in the table at once.
const RETENTION_MS = 31 * 86_400_000
// Rows this far behind the newest processed swap are kept. Slices end on a
// bucket boundary (trimToBucketBoundary), so no later slice needs them; the
// margin is only a safety net.
const PRUNE_TAIL_MS = 30 * 60_000

// First height at which the pool's contract exists (bisection on the
// archive), so a long backfill does not walk empty blocks before the pool.
// Resolution of the bisection: the result is within this many blocks below
// the contract's first height.
const CREATION_PRECISION = 2000

const creationHeight = async (poolId: string, hi: number) => {
  const address = await withBackoff(`pool ${poolId} contract`, () =>
    poolContractAddress(poolId, hosts)
  )
  let lo = 1
  while (hi - lo > CREATION_PRECISION) {
    const mid = Math.floor((lo + hi) / 2)
    const liquidity = await withBackoff(`pool ${poolId} exists @${mid}`, () =>
      poolLiquidityAt(address, mid, hosts)
    )
    if (liquidity === null) lo = mid
    else hi = mid
  }
  return lo
}

// A page of large txs can exceed the archive's 10MB gRPC cap (reported as a
// 429 "received message larger than max"); retrying the same page never
// succeeds, so halve the page size for that slice instead.
const fetchSlice = async (poolId: string, from: number, to: number) => {
  for (
    let pageLimit = 100;
    ;
    pageLimit = Math.max(1, Math.floor(pageLimit / 2))
  ) {
    try {
      return await withBackoff(`pool ${poolId} @${from}`, () =>
        fetchSwapEvents({ poolId, from, to, maxPages: 50, hosts, pageLimit })
      )
    } catch (e) {
      if (!String(e).includes("larger than max") || pageLimit === 1) throw e
      console.warn(
        `pool ${poolId} @${from}: page too large, trying ${Math.floor(pageLimit / 2)} per page`
      )
    }
  }
}

for (const poolId of poolIds) {
  let cursor = await db.activityCursor.findUnique({ where: { poolId } })
  if (!cursor) {
    // No live ingest yet: anchor the cursor at the tip so the cron continues
    // from exactly where this backfill ends.
    cursor = await db.activityCursor.create({
      data: { poolId, height: BigInt(tip), coveredFrom: tipTime },
    })
  }
  if (cursor.coveredFrom <= startTime) {
    console.log(
      `pool ${poolId}: already covered from ${cursor.coveredFrom.toISOString()}`
    )
    continue
  }
  // Stop where existing coverage begins (an earlier, shorter backfill), with an
  // overlap of ~40 minutes: inserts are idempotent, and the overlap must span
  // the whole bucket the earlier backfill started in (which it wrote from a
  // partial set of rows). The final slice's last bucket is left untouched by
  // trimToBucketBoundary, so the earlier, complete rollup there is kept.
  const coverageStart = await withBackoff(`pool ${poolId} coverage start`, () =>
    heightAtTime(cursor.coveredFrom, { tip: chain, hosts })
  )
  const end = Math.min(Number(cursor.height), coverageStart.height + 2000)
  const created = await creationHeight(poolId, end)
  const poolStart = Math.max(start, created)

  // Resume a previous run over the same (or a wider) range. Which height the
  // creation bisection lands on depends on its upper bound (`end`), so a re-run
  // can start up to CREATION_PRECISION blocks earlier than the run it resumes;
  // those blocks precede the contract and hold no swaps, so a stored range
  // starting within that margin still covers the pool. (The margin does not
  // apply when the start comes from --days: those blocks are real history.)
  const startMargin = created >= start ? CREATION_PRECISION : 0
  const resumable =
    cursor.backfillFrom !== null &&
    cursor.backfillTo !== null &&
    Number(cursor.backfillFrom) <= poolStart + startMargin
  let from = resumable
    ? Math.max(Number(cursor.backfillTo), poolStart)
    : poolStart
  if (!resumable) {
    await db.activityCursor.update({
      where: { poolId },
      data: { backfillFrom: BigInt(poolStart), backfillTo: BigInt(poolStart) },
    })
  }
  console.log(`pool ${poolId}: ${from} -> ${end}`)

  let rows = 0
  let pruned = 0
  while (from < end) {
    const to = Math.min(from + slice, end)
    const fetched = await fetchSlice(poolId, from, to)
    const coveredToTime = await withBackoff(`pool ${poolId} time`, () =>
      blockTime(fetched.coveredTo, hosts)
    )
    const { events, coveredTo } = trimToBucketBoundary(fetched.events, {
      coveredTo: fetched.coveredTo,
      coveredToTime,
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
    if (events.length > 0) {
      const newest = Math.max(
        ...events.map((e: any) => new Date(e.timestamp).getTime())
      )
      const cutoff = Math.min(Date.now() - RETENTION_MS, newest - PRUNE_TAIL_MS)
      pruned += (
        await db.poolSwap.deleteMany({
          where: { poolId, ts: { lt: new Date(cutoff) } },
        })
      ).count
    }
    const pct = (((coveredTo - poolStart) / (end - poolStart)) * 100).toFixed(1)
    console.log(
      `pool ${poolId}: ${coveredTo}/${end} (${pct}%), ${rows} rows, ${pruned} pruned`
    )
    from = coveredTo
  }

  await db.activityCursor.update({
    where: { poolId },
    data: { coveredFrom: startTime },
  })
  console.log(`pool ${poolId}: done, covered from ${startTime.toISOString()}`)
}

await db.$disconnect()
