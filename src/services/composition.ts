import { unstable_cache } from "next/cache"
import BigNumber from "bignumber.js"
import _ from "lodash"

import { getPrisma, isDatabaseEnabled } from "@/lib/database"

import { getAssetMap, getFrontendAssetSymbolsSafe } from "./asset"
import { getVariantProvenanceSafe } from "./provenance"

// Reserve history for the Backing Over Time chart, from the daily
// pool_reserve_snapshot rows. Amounts are converted to display units here so
// the client can stack variants that share an underlying unit.

export type CompositionDenom = {
  denom: string
  symbol: string
  issuer: string | null
  origin: string | null
}

export type PoolComposition = {
  points: { time: number; values: Record<string, number> }[]
  denoms: CompositionDenom[]
}

const fetchPoolComposition = async (
  poolId: string
): Promise<PoolComposition | null> => {
  if (!isDatabaseEnabled()) return null
  const rows = await getPrisma().poolReserveSnapshot.findMany({
    where: { poolId },
    orderBy: { ts: "asc" },
  })
  const denomList = _.uniq(rows.map((r) => r.denom))
  if (denomList.length === 0) return null

  const [assetMap, symbols, provenance] = await Promise.all([
    getAssetMap(),
    getFrontendAssetSymbolsSafe(),
    getVariantProvenanceSafe(denomList),
  ])
  const decimals = (denom: string) => assetMap[denom]?.decimal ?? 6

  const points = _.chain(rows)
    .groupBy((r) => r.height.toString())
    .map((group) => ({
      time: group[0].ts.getTime(),
      values: _.fromPairs(
        group.map((r) => [
          r.denom,
          new BigNumber(r.amount.toFixed(0))
            .shiftedBy(-decimals(r.denom))
            .toNumber(),
        ])
      ),
    }))
    .sortBy("time")
    .value()
  if (points.length < 2) return null

  return {
    points,
    denoms: denomList.map((denom) => ({
      denom,
      symbol: symbols[denom] ?? assetMap[denom]?.symbol ?? denom,
      issuer: provenance[denom]?.issuer ?? null,
      origin: provenance[denom]?.origin ?? null,
    })),
  }
}

// Snapshots are daily, so an hourly cache is plenty.
const getCachedPoolComposition = unstable_cache(
  fetchPoolComposition,
  ["pool-composition-v1"],
  { revalidate: 3600 }
)

// Non-throwing: the chart is simply hidden when history is unavailable.
export const getPoolComposition = async (poolId: string) => {
  try {
    return await getCachedPoolComposition(poolId)
  } catch (e) {
    console.error(`[getPoolComposition] ${poolId}: ${e}`)
    return null
  }
}
