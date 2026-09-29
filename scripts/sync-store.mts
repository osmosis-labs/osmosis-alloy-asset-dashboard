// Copies activity data recorded in one store (e.g. a local Postgres that stood
// in while production was unavailable) into another, in as few operations as
// possible: swap rows and reserve snapshots in bulk inserts (thousands of rows
// each, duplicates skipped), then one recompute of the target's 15-minute
// rollups over the copied window, then one cursor update that only ever moves
// a cursor forward. Safe to re-run; the target keeps anything it already has.
//
//   pnpm store:sync --from ./local.env --to ~/.claude/alloy-dashboard.env \
//     --since 2026-09-28T00:00:00Z [--dry-run]
//
// Both env files give a POSTGRES_PRISMA_URL (or DATABASE_URL).
import fs from "node:fs"
import os from "node:os"
import { parseArgs } from "node:util"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"
import dotenv from "dotenv"
import _ from "lodash"

const { values: args } = parseArgs({
  options: {
    from: { type: "string" },
    to: { type: "string" },
    since: { type: "string" },
    "dry-run": { type: "boolean", default: false },
  },
})
if (!args.from || !args.to || !args.since) {
  console.error("Usage: --from <env file> --to <env file> --since <ISO time>")
  process.exit(1)
}
const since = new Date(args.since)
if (Number.isNaN(since.getTime())) throw new Error(`bad --since ${args.since}`)

const urlFrom = (file: string) => {
  const env = dotenv.parse(
    fs.readFileSync(file.replace(/^~(?=$|[\\/])/, os.homedir()))
  )
  const url = env.POSTGRES_PRISMA_URL || env.DATABASE_URL || env.POSTGRES_URL
  if (!url) throw new Error(`${file} has no database URL`)
  return url
}
const client = (url: string) =>
  new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) })

const fromUrl = urlFrom(args.from)
const toUrl = urlFrom(args.to)
if (fromUrl === toUrl) throw new Error("--from and --to are the same store")
const source = client(fromUrl)
const target = client(toUrl)
const dry = args["dry-run"]
let ops = 0

// Swap rows: 13 parameters a row, so 4,000 rows an insert.
const swaps = await source.poolSwap.findMany({ where: { ts: { gte: since } } })
console.log(`swap rows since ${since.toISOString()}: ${swaps.length}`)
let swapsAdded = 0
for (const chunk of _.chunk(swaps, 4000)) {
  if (!dry) {
    swapsAdded += (
      await target.poolSwap.createMany({ data: chunk, skipDuplicates: true })
    ).count
  }
  ops++
}

// Reserve snapshots: 5 parameters a row.
const snapshots = await source.poolReserveSnapshot.findMany()
console.log(`reserve snapshot rows: ${snapshots.length}`)
let snapshotsAdded = 0
for (const chunk of _.chunk(snapshots, 10000)) {
  if (!dry) {
    snapshotsAdded += (
      await target.poolReserveSnapshot.createMany({
        data: chunk,
        skipDuplicates: true,
      })
    ).count
  }
  ops++
}

// Rollups over the copied window, recomputed from the target's rows (its own
// plus the copied ones), for every pool with swaps in it.
const pools = _.uniq(swaps.map((s) => s.poolId))
if (pools.length > 0 && !dry) {
  await target.$executeRaw`
    INSERT INTO pool_flow_15m (pool_id, bucket, denom, amount_in, amount_out, swaps)
    SELECT pool_id, bucket, denom, SUM(amount_in), SUM(amount_out), COUNT(*)::int
    FROM (
      SELECT pool_id,
             to_timestamp(floor(extract(epoch FROM ts) / 900) * 900) AT TIME ZONE 'UTC' AS bucket,
             denom_in AS denom, amount_in, 0::numeric AS amount_out
      FROM pool_swap WHERE pool_id = ANY(${pools}::text[]) AND ts >= ${since}
      UNION ALL
      SELECT pool_id,
             to_timestamp(floor(extract(epoch FROM ts) / 900) * 900) AT TIME ZONE 'UTC' AS bucket,
             denom_out AS denom, 0::numeric AS amount_in, amount_out
      FROM pool_swap WHERE pool_id = ANY(${pools}::text[]) AND ts >= ${since}
    ) flows
    GROUP BY pool_id, bucket, denom
    ON CONFLICT (pool_id, bucket, denom) DO UPDATE
      SET amount_in = EXCLUDED.amount_in,
          amount_out = EXCLUDED.amount_out,
          swaps = EXCLUDED.swaps
  `
}
if (pools.length > 0) ops++

// Cursors: move each target cursor forward to the source's, never back, and
// keep the target's coverage start (it reaches further back).
const cursors = await source.activityCursor.findMany()
if (cursors.length > 0 && !dry) {
  const ids = cursors.map((c) => c.poolId)
  const heights = cursors.map((c) => c.height.toString())
  const froms = cursors.map((c) => c.coveredFrom)
  const throughs = cursors.map((c) => c.coveredThrough)
  await target.$executeRaw`
    INSERT INTO activity_cursor (pool_id, height, covered_from, covered_through, updated_at)
    SELECT pool_id, height::bigint, covered_from, covered_through, now()
    FROM unnest(${ids}::text[], ${heights}::text[], ${froms}::timestamp[], ${throughs}::timestamp[])
      AS c(pool_id, height, covered_from, covered_through)
    ON CONFLICT (pool_id) DO UPDATE
      SET height = GREATEST(activity_cursor.height, EXCLUDED.height),
          covered_through = GREATEST(activity_cursor.covered_through, EXCLUDED.covered_through),
          updated_at = now()
  `
}
if (cursors.length > 0) ops++

console.log(
  dry
    ? `dry run: would take about ${ops} write operations on the target`
    : `copied ${swapsAdded} swap rows and ${snapshotsAdded} snapshot rows, rollups for ${pools.length} pools, ${cursors.length} cursors (${ops} write operations)`
)
await source.$disconnect()
await target.$disconnect()
