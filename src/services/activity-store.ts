import { PoolSwap } from "@/types/tx"
import { getPrisma, isDatabaseEnabled } from "@/lib/database"

import { FlowPoint } from "./swap-rows"

// Read side of the activity store. The pool page uses it only when the store
// has fresh, complete data for the requested window; otherwise the callers in
// src/services/pool.ts fall back to live LCD queries.

// The cron runs every 15 min; allow a few missed runs before treating the
// store as stale.
const MAX_STALENESS_MS = 60 * 60 * 1000

export const isStoreReady = async (
  poolId: string,
  windowStart: Date
): Promise<boolean> => {
  if (!isDatabaseEnabled()) return false
  try {
    const cursor = await getPrisma().activityCursor.findUnique({
      where: { poolId },
    })
    return (
      !!cursor &&
      cursor.coveredFrom <= windowStart &&
      Date.now() - cursor.updatedAt.getTime() <= MAX_STALENESS_MS
    )
  } catch (e) {
    console.error(`[activity-store] cursor read failed for ${poolId}: ${e}`)
    return false
  }
}

export const readFlowPoints = async (
  poolId: string,
  from: Date
): Promise<FlowPoint[]> => {
  const rows = await getPrisma().poolFlow15m.findMany({
    where: { poolId, bucket: { gte: from } },
    orderBy: { bucket: "asc" },
  })
  return rows.map((r) => ({
    time: r.bucket.getTime(),
    denom: r.denom,
    amountIn: r.amountIn.toFixed(0),
    amountOut: r.amountOut.toFixed(0),
    swaps: r.swaps,
  }))
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
    in: { amount: r.amountIn.toFixed(0), denom: r.denomIn },
    out: { amount: r.amountOut.toFixed(0), denom: r.denomOut },
  }))
}
