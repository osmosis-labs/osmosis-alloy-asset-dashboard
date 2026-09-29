import { unstable_cache } from "next/cache"
import BigNumber from "bignumber.js"
import _ from "lodash"

import { getPrisma, isDatabaseEnabled } from "@/lib/database"

import { getAssetMap, getFrontendAssetSymbolsSafe } from "./asset"
import { getVariantProvenanceSafe } from "./provenance"

// Reserve history for the Backing Over Time chart, from the
// pool_reserve_snapshot rows (hourly for the last week, daily before that). Amounts are converted to display units here so
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
  // A denom without assetlist decimals cannot be converted to display units,
  // so it is left out of the chart rather than scaled by a guess.
  const unknown = denomList.filter((d) => assetMap[d]?.decimal === undefined)
  if (unknown.length > 0) {
    console.warn(`[getPoolComposition] ${poolId}: no decimals for ${unknown}`)
  }
  const known = denomList.filter((d) => !unknown.includes(d))
  if (known.length === 0) return null
  const decimals = (denom: string) => assetMap[denom].decimal

  const points = _.chain(rows.filter((r) => !unknown.includes(r.denom)))
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
    denoms: known.map((denom) => ({
      denom,
      symbol: symbols[denom] ?? assetMap[denom]?.symbol ?? denom,
      issuer: provenance[denom]?.issuer ?? null,
      origin: provenance[denom]?.origin ?? null,
    })),
  }
}

// Snapshots are hourly, so the chart refreshes hourly: a shorter cache only
// re-reads (billed) the same rows.
const getCachedPoolComposition = unstable_cache(
  fetchPoolComposition,
  ["pool-composition-v2"],
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
