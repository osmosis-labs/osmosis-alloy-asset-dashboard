import { PoolSwap } from "@/types/tx"
import { getPrisma, isDatabaseEnabled } from "@/lib/database"

import { dailyFlowCutoff } from "./activity-ingest"
import { floorToStoreBucket, FlowPoint } from "./swap-rows"

// Read side of the activity store. The pool page uses it only when the store
// has fresh, complete data for the requested window; otherwise the callers in
// src/services/pool.ts fall back to live LCD queries.

// The cron runs every 15 min; allow a few missed runs before treating the
// store as stale.
const MAX_STALENESS_MS = 60 * 60 * 1000

// Pure: fresh when the store is complete through a block within the last
// hour. Judged on covered_through (block time), not updatedAt: a page-capped
// ingest or a backfill write bumps updatedAt while recent swaps are missing.
export const isFresh = (coveredThrough: Date | null, now = Date.now()) =>
  !!coveredThrough && now - coveredThrough.getTime() <= MAX_STALENESS_MS

// The store's coverage for a pool when it is fresh, else null.
export const getStoreCoverage = async (
  poolId: string
): Promise<{ coveredFrom: Date } | null> => {
  if (!isDatabaseEnabled()) return null
  try {
    const cursor = await getPrisma().activityCursor.findUnique({
      where: { poolId },
    })
    if (!cursor) return null
    if (!isFresh(cursor.coveredThrough)) return null
    return { coveredFrom: cursor.coveredFrom }
  } catch (e) {
    console.error(`[activity-store] cursor read failed for ${poolId}: ${e}`)
    return null
  }
}

// Flows from `from`: 15-minute rollups for recent buckets, and daily ones for
// days folded into pool_flow_daily (older than DAILY_FLOW_AFTER_DAYS). A day is
// in one table or the other, never both (foldFlowsToDaily moves it in one
// transaction), so the two reads never double count. The daily read is
// skipped when `from` is too recent for any folded day to reach it.
export const readFlowPoints = async (
  poolId: string,
  from: Date,
  now = Date.now()
): Promise<FlowPoint[]> => {
  const db = getPrisma()
  // From the bucket (or day) containing `from`, so the straddling one is kept
  // (bucket keys are 15-minute or day starts, `from` an exact time).
  const [daily, recent] = await Promise.all([
    from.getTime() < dailyFlowCutoff(now).getTime() + 86_400_000
      ? db.poolFlowDaily.findMany({
          where: { poolId, day: { gte: startOfUtcDay(from) } },
          orderBy: { day: "asc" },
        })
      : [],
    db.poolFlow15m.findMany({
      where: {
        poolId,
        bucket: { gte: new Date(floorToStoreBucket(from.getTime())) },
      },
      orderBy: { bucket: "asc" },
    }),
  ])
  const point = (
    time: Date,
    r: Pick<
      (typeof recent)[number],
      "denom" | "amountIn" | "amountOut" | "swaps"
    >
  ) => ({
    time: time.getTime(),
    denom: r.denom,
    amountIn: r.amountIn.toFixed(0),
    amountOut: r.amountOut.toFixed(0),
    swaps: r.swaps,
  })
  return [
    ...daily.map((r) => point(r.day, r)),
    ...recent.map((r) => point(r.bucket, r)),
  ]
}

const startOfUtcDay = (d: Date) => {
  const day = new Date(d)
  day.setUTCHours(0, 0, 0, 0)
  return day
}

export const readSwaps = async (
  poolId: string,
  limit: number
): Promise<PoolSwap[]> => {
  const rows = await getPrisma().poolSwap.findMany({
    where: { poolId },
    orderBy: [{ ts: "desc" }, { txHash: "asc" }, { eventIndex: "asc" }],
    take: limit,
  })
  return rows.map((r) => ({
    hash: r.txHash,
    height: Number(r.height),
    timestamp: r.ts.toISOString(),
    success: true,
    sender: r.sender,
    action: r.action,
    contract: r.contract ?? undefined,
    in: { amount: r.amountIn.toFixed(0), denom: r.denomIn },
    out: { amount: r.amountOut.toFixed(0), denom: r.denomOut },
  }))
}
