// Backfill daily pool reserve snapshots (00:00 UTC) for the Backing Over Time
// chart.
//
//   pnpm reserves:backfill --env ~/.claude/alloy-dashboard.env [--days 365]
//                          [--pool 3497]
//
// For each day, finds the block height at 00:00 UTC once (shared by all
// pools), then queries each pool's get_total_pool_liquidity at that height on
// the archive LCD. Days already stored are skipped, so it resumes on re-run;
// days before a pool's contract existed are skipped too.
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"
import dotenv from "dotenv"

const { values: args } = parseArgs({
  options: {
    env: { type: "string" },
    days: { type: "string", default: "365" },
    pool: { type: "string", multiple: true },
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

const db = getPrisma()
const poolIds: string[] = args.pool?.length
  ? args.pool
  : await fetch("https://alloyed.osmosis.zone/api/pools")
      .then((r) => r.json())
      .then((pools: { id: string }[]) => pools.map((p) => p.id))
const contracts = Object.fromEntries(
  await Promise.all(
    poolIds.map(async (id) => [id, await poolContractAddress(id)] as const)
  )
)

const days = Number(args.days)
const tip = await chainTip()
const today = new Date()
today.setUTCHours(0, 0, 0, 0)
let rows = 0
// Newest day first, so the chart fills in from the present backwards.
for (let d = 0; d < days; d++) {
  const target = new Date(today.getTime() - d * 86_400_000)
  const dayStart = new Date(target.getTime() - 3_600_000)
  const dayEnd = new Date(target.getTime() + 3_600_000)

  const pending: string[] = []
  for (const poolId of poolIds) {
    const existing = await db.poolReserveSnapshot.findFirst({
      where: { poolId, ts: { gte: dayStart, lt: dayEnd } },
      select: { ts: true },
    })
    if (!existing) pending.push(poolId)
  }
  if (pending.length === 0) continue

  const { height, time } = await withBackoff(
    `height @${target.toISOString()}`,
    () => heightAtTime(target, { tip })
  )
  for (const poolId of pending) {
    const liquidity = await withBackoff(`pool ${poolId} @${height}`, () =>
      poolLiquidityAt(contracts[poolId], height)
    )
    if (liquidity === null) continue // contract not instantiated yet
    rows += await writeSnapshot(db, poolId, height, time, liquidity)
  }
  console.log(
    `${target.toISOString().slice(0, 10)} (h ${height}): ${pending.join(",")} -> ${rows} rows total`
  )
}

await db.$disconnect()
