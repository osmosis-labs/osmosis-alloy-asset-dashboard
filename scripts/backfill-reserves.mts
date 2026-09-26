// Backfill pool reserve snapshots for the Backing Over Time chart: hourly for
// the last --hourly-days (matching the cron, which keeps a week hourly), then
// daily at 00:00 UTC back to --days.
//
//   pnpm reserves:backfill --env ~/.claude/alloy-dashboard.env [--days 365]
//                          [--hourly-days 7] [--pool 3497]
//                          [--host https://lcd.archive.osmosis.zone]
//
// For each target time, finds the block height once (shared by all pools),
// then queries each pool's get_total_pool_liquidity at that height on the
// archive LCD. Targets already stored are skipped, so it resumes on re-run.
// Targets walk newest first, so once a pool's contract is missing at a height
// the pool is dropped from all earlier targets.
//
// --host defaults to the Osmosis archive. For recent targets any LCD that
// keeps enough state and serves historical smart queries works too (several
// public ones keep a few weeks), which helps when the archive is down.
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"
import dotenv from "dotenv"

const { values: args } = parseArgs({
  options: {
    env: { type: "string" },
    days: { type: "string", default: "365" },
    "hourly-days": { type: "string", default: "7" },
    pool: { type: "string", multiple: true },
    host: { type: "string", multiple: true },
  },
})
if (args.env) {
  dotenv.config({
    path: args.env.replace(/^~(?=$|[\\/])/, os.homedir()),
    quiet: true,
  })
}

const imp = (p: string) => import(pathToFileURL(path.resolve(p)).href)
const { getPrisma, isDatabaseEnabled } = await imp("src/lib/database.ts")
const {
  chainTip,
  heightAtTime,
  poolContractAddress,
  poolLiquidityAt,
  writeSnapshot,
} = await imp("src/services/reserves.ts")

if (!isDatabaseEnabled()) {
  console.error("No database URL: pass --env with the store's connection URL.")
  process.exit(1)
}

const withBackoff = async <T,>(
  label: string,
  fn: () => Promise<T>
): Promise<T> => {
  const delays = [10_000, 30_000, 60_000, 120_000]
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (attempt >= delays.length) throw e
      console.warn(`${label}: ${e}; retrying in ${delays[attempt] / 1000}s`)
      await new Promise((r) => setTimeout(r, delays[attempt]))
    }
  }
}

const hosts: string[] = args.host?.length
  ? args.host
  : ["https://lcd.archive.osmosis.zone"]
const db = getPrisma()
const poolIds: string[] = args.pool?.length
  ? args.pool
  : await fetch("https://alloyed.osmosis.zone/api/pools")
      .then((r) => r.json())
      .then((pools: { id: string }[]) => pools.map((p) => p.id))
const contracts = Object.fromEntries(
  await Promise.all(
    poolIds.map(
      async (id) => [id, await poolContractAddress(id, hosts)] as const
    )
  )
)

const days = Number(args.days)
const tip = await chainTip(hosts)
const HOUR = 3_600_000
const DAY = 24 * HOUR
const hourlyDays = Number(args["hourly-days"])
const thisHour = Math.floor(Date.now() / HOUR) * HOUR
const today = Math.floor(Date.now() / DAY) * DAY

// Newest first, so the chart fills in from the present backwards. A stored
// snapshot within `window` of a target counts as that target.
const targets: { time: number; window: number }[] = []
for (let t = thisHour; t > Date.now() - hourlyDays * DAY; t -= HOUR) {
  targets.push({ time: t, window: 20 * 60_000 })
}
for (let d = 0; d < days; d++) {
  const time = today - d * DAY
  if (time < Date.now() - hourlyDays * DAY) targets.push({ time, window: HOUR })
}

// Pools whose contract did not exist yet at an already-visited target.
const beforeCreation = new Set<string>()
let rows = 0
for (const { time: targetTime, window } of targets) {
  const target = new Date(targetTime)
  const pending: string[] = []
  for (const poolId of poolIds) {
    if (beforeCreation.has(poolId)) continue
    const existing = await db.poolReserveSnapshot.findFirst({
      where: {
        poolId,
        ts: {
          gte: new Date(targetTime - window),
          lt: new Date(targetTime + window),
        },
      },
      select: { ts: true },
    })
    if (!existing) pending.push(poolId)
  }
  if (pending.length === 0) continue

  const { height, time } = await withBackoff(
    `height @${target.toISOString()}`,
    () => heightAtTime(target, { tip, hosts })
  )
  for (const poolId of pending) {
    const liquidity = await withBackoff(`pool ${poolId} @${height}`, () =>
      poolLiquidityAt(contracts[poolId], height, hosts)
    )
    if (liquidity === null) {
      beforeCreation.add(poolId) // contract not instantiated yet
      continue
    }
    rows += await writeSnapshot(db, poolId, height, time, liquidity)
  }
  console.log(
    `${target.toISOString().slice(0, 16)} (h ${height}): ${pending.join(",")} -> ${rows} rows total`
  )
}

await db.$disconnect()
