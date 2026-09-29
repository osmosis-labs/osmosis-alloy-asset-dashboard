// Integration tests for the activity store's SQL (batched cron writes, the
// daily fold, flow reads, snapshot thinning) against a real, THROWAWAY
// Postgres. Skipped unless TEST_DATABASE_URL is set; every test empties the
// tables first, so never point it at a database whose data matters.
//
//   TEST_DATABASE_URL=postgresql://... pnpm test:store
//   (the schema must be pushed first: DATABASE_URL=$TEST_DATABASE_URL pnpm db:push)
import assert from "node:assert/strict"
import path from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"

const url = process.env.TEST_DATABASE_URL
if (url) {
  process.env.POSTGRES_PRISMA_URL = url
  process.env.DATABASE_URL = url
}
const imp = (p: string) => import(pathToFileURL(path.resolve(p)).href)

const skip = !url && "TEST_DATABASE_URL not set"
const { getPrisma } = url ? await imp("src/lib/database.ts") : ({} as any)
const ingest = url ? await imp("src/services/activity-ingest.ts") : ({} as any)
const store = url ? await imp("src/services/activity-store.ts") : ({} as any)
const reserves = url ? await imp("src/services/reserves.ts") : ({} as any)
const db = url ? getPrisma() : null

const reset = async () => {
  await db.$executeRawUnsafe(
    "TRUNCATE pool_swap, pool_flow_15m, pool_flow_daily, activity_cursor, pool_reserve_snapshot"
  )
}

// A swap of `amount` from denom a to b at `iso`.
let seq = 0
const swap = (iso: string, amount = "10", height = 100) => ({
  hash: `tx${seq++}`,
  height,
  msgIndex: 0,
  eventIndex: 0,
  timestamp: iso,
  sender: "osmo1x",
  action: "swap",
  contract: null,
  in: { denom: "a", amount },
  out: { denom: "b", amount },
})
const plan = (poolId: string, events: unknown[], coveredTo = 200) => ({
  poolId,
  events,
  coveredTo,
  coveredThrough: new Date("2026-09-29T00:20:00Z"),
  coveredFrom: new Date("2026-09-29T00:00:00Z"),
})

test(
  "one batched write stores every pool's rows, rollups and cursor",
  { skip },
  async () => {
    await reset()
    await ingest.writeIngestBatch(db, [
      plan("1", [
        swap("2026-09-29T00:01:00Z"),
        swap("2026-09-29T00:02:00Z", "5"),
      ]),
      plan("2", [swap("2026-09-29T00:16:00Z", "7")]),
      plan("3", [], 150),
    ])
    assert.equal(await db.poolSwap.count(), 3)
    const flows = await db.poolFlow15m.findMany({
      orderBy: [{ poolId: "asc" }, { denom: "asc" }],
    })
    const a1 = flows.find((f: any) => f.poolId === "1" && f.denom === "a")
    assert.equal(a1.amountIn.toFixed(0), "15")
    assert.equal(a1.swaps, 2)
    assert.equal(a1.bucket.toISOString(), "2026-09-29T00:00:00.000Z")
    const b2 = flows.find((f: any) => f.poolId === "2" && f.denom === "b")
    assert.equal(b2.amountOut.toFixed(0), "7")
    assert.equal(b2.bucket.toISOString(), "2026-09-29T00:15:00.000Z")
    const cursors = await db.activityCursor.findMany({
      orderBy: { poolId: "asc" },
    })
    assert.deepEqual(
      cursors.map((c: any) => [c.poolId, c.height.toString()]),
      [
        ["1", "200"],
        ["2", "200"],
        ["3", "150"],
      ]
    )
  }
)

test(
  "re-running the same batch changes nothing; a null coveredThrough keeps the stored one",
  { skip },
  async () => {
    await reset()
    const events = [swap("2026-09-29T00:01:00Z")]
    await ingest.writeIngestBatch(db, [plan("1", events)])
    await ingest.writeIngestBatch(db, [
      { ...plan("1", events, 210), coveredThrough: null },
    ])
    assert.equal(await db.poolSwap.count(), 1)
    const flow = await db.poolFlow15m.findFirst({ where: { denom: "a" } })
    assert.equal(flow.amountIn.toFixed(0), "10")
    const cursor = await db.activityCursor.findUnique({
      where: { poolId: "1" },
    })
    assert.equal(cursor.height.toString(), "210")
    assert.equal(
      cursor.coveredThrough.toISOString(),
      "2026-09-29T00:20:00.000Z"
    )
  }
)

test(
  "folding moves whole old days to daily rows, and reads see each day once",
  { skip },
  async () => {
    await reset()
    await ingest.writeIngestBatch(db, [
      plan("1", [
        swap("2026-09-10T01:00:00Z", "3"),
        swap("2026-09-10T13:00:00Z", "4"),
        swap("2026-09-28T09:00:00Z", "5"),
      ]),
    ])
    const now = new Date("2026-09-29T00:05:00Z").getTime()
    const cutoff = ingest.dailyFlowCutoff(now)
    assert.equal(cutoff.toISOString(), "2026-09-21T00:00:00.000Z")
    await ingest.foldFlowsToDaily(db, cutoff)
    const daily = await db.poolFlowDaily.findMany({ where: { denom: "a" } })
    assert.equal(daily.length, 1)
    assert.equal(daily[0].day.toISOString(), "2026-09-10T00:00:00.000Z")
    assert.equal(daily[0].amountIn.toFixed(0), "7")
    assert.equal(daily[0].swaps, 2)
    assert.equal(
      await db.poolFlow15m.count({ where: { bucket: { lt: cutoff } } }),
      0
    )
    // A read from before the folded day sees the daily row and the recent one.
    const points = await store.readFlowPoints(
      "1",
      new Date("2026-09-01T00:00:00Z"),
      now
    )
    const ins = points
      .filter((p: any) => p.denom === "a")
      .map((p: any) => [new Date(p.time).toISOString(), p.amountIn])
    assert.deepEqual(ins, [
      ["2026-09-10T00:00:00.000Z", "7"],
      ["2026-09-28T09:00:00.000Z", "5"],
    ])
    // Folding again is a no-op.
    await ingest.foldFlowsToDaily(db, cutoff)
    const again = await db.poolFlowDaily.findFirst({ where: { denom: "a" } })
    assert.equal(again.amountIn.toFixed(0), "7")
  }
)

test("a recent read skips the daily table", { skip }, async () => {
  await reset()
  await db.poolFlowDaily.create({
    data: {
      poolId: "1",
      day: new Date("2026-09-10T00:00:00Z"),
      denom: "a",
      amountIn: 1,
      amountOut: 0,
      swaps: 1,
    },
  })
  const now = new Date("2026-09-29T12:00:00Z").getTime()
  const points = await store.readFlowPoints(
    "1",
    new Date(now - 7 * 86_400_000),
    now
  )
  assert.equal(points.length, 0)
})

test(
  "snapshots: one insert for many pools; thinning keeps daily, then weekly",
  { skip },
  async () => {
    await reset()
    const day = 86_400_000
    const now = Date.now()
    const rows = []
    // Two snapshots a day for 120 days, for two pools.
    for (let d = 0; d < 120; d++) {
      for (const h of [3, 15]) {
        const ts = new Date(now - d * day - h * 3_600_000)
        for (const poolId of ["1", "2"]) {
          rows.push({
            poolId,
            height: 1_000_000 - d * 10 - h,
            ts,
            liquidity: [{ denom: "a", amount: "1" }],
          })
        }
      }
    }
    const written = await reserves.writeSnapshots(db, rows)
    assert.equal(written, rows.length)
    await reserves.pruneReserveSnapshots(db, 7, 90)
    const left = await db.poolReserveSnapshot.findMany({
      where: { poolId: "1" },
    })
    const recent = left.filter((r: any) => r.ts.getTime() > now - 7 * day)
    const mid = left.filter(
      (r: any) =>
        r.ts.getTime() <= now - 8 * day && r.ts.getTime() > now - 89 * day
    )
    const old = left.filter((r: any) => r.ts.getTime() < now - 91 * day)
    assert.ok(recent.length >= 13, "the last week stays twice daily")
    assert.ok(
      mid.length >= 79 && mid.length <= 83,
      `daily in between (${mid.length})`
    )
    assert.ok(
      old.length >= 3 && old.length <= 6,
      `weekly beyond 90 days (${old.length})`
    )
  }
)

test.after(async () => {
  if (db) {
    await reset()
    await db.$disconnect()
  }
})
