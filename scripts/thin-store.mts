// One-off (and repeatable) storage thinning for the activity store: folds
// 15-minute rollups older than 8 days into daily rows, drops swap rows older
// than 7 days, thins reserve snapshots (daily after 7 days, weekly after 90),
// then rewrites the tables (VACUUM FULL) so the space is actually released.
// The cron does the same thinning daily from now on; this catches up the
// history written before it did. A dozen or so database operations in all.
//
//   pnpm store:thin --env ~/.claude/alloy-dashboard.env [--no-vacuum]
//
// VACUUM FULL locks each table while it is rewritten (seconds at these sizes);
// run it outside the cron's minute marks (:00, :15, :30, :45).
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { parseArgs } from "node:util"
import dotenv from "dotenv"

const { values: args } = parseArgs({
  options: {
    env: { type: "string" },
    "no-vacuum": { type: "boolean", default: false },
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
const { dailyFlowCutoff, foldFlowsToDaily, pruneSwaps } = await imp(
  "src/services/activity-ingest.ts"
)
const { pruneReserveSnapshots } = await imp("src/services/reserves.ts")

if (!isDatabaseEnabled()) {
  console.error("No database URL: pass --env with the store's connection URL.")
  process.exit(1)
}
const db = getPrisma()

const TABLES = [
  "pool_flow_15m",
  "pool_flow_daily",
  "pool_swap",
  "pool_reserve_snapshot",
  "activity_cursor",
]
const sizes = async () => {
  const rows = (await db.$queryRawUnsafe(`
    SELECT relname AS table, pg_size_pretty(pg_total_relation_size(c.oid)) AS size
    FROM pg_class c
    WHERE relname IN (${TABLES.map((t) => `'${t}'`).join(",")})
    UNION ALL
    SELECT 'database', pg_size_pretty(pg_database_size(current_database()))
  `)) as { table: string; size: string }[]
  return Object.fromEntries(rows.map((r) => [r.table, r.size]))
}

console.log("before", await sizes())
const cutoff = dailyFlowCutoff(Date.now())
console.log(`folding 15-minute rollups before ${cutoff.toISOString()}`)
console.log("  ", await foldFlowsToDaily(db, cutoff))
console.log("pruned swap rows:", await pruneSwaps(db, 7))
console.log("thinned snapshots:", await pruneReserveSnapshots(db, 7, 90))

if (!args["no-vacuum"]) {
  for (const table of TABLES) {
    console.log(`VACUUM FULL ${table}`)
    await db.$executeRawUnsafe(`VACUUM FULL ${table}`)
  }
}
console.log("after", await sizes())
await db.$disconnect()
