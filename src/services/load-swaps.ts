import { getAssetPrice } from "@/services/asset"
import { getContractNamesSafe } from "@/services/contracts"
import { getDenomMetaSafe } from "@/services/denom-meta"
import { getPoolSwaps } from "@/services/pool"
import _ from "lodash"

import { PoolOverview } from "@/types/pool"
import { PoolSwap } from "@/types/tx"
import { variantDenom } from "@/lib/pool-sources"

import type { ExtraDenomMeta } from "@/components/transaction-table-content"

export type SwapsResult =
  | {
      ok: true
      swaps: PoolSwap[]
      contractNames: Record<string, string | null>
      extraDenoms: Record<string, ExtraDenomMeta>
    }
  | { ok: false }

// Symbol, decimals and price for swap denoms missing from the pool's current
// reserves. The pools API omits a variant whose balance is zero, which happens
// whenever a variant is drained; its swaps still need a value. Non-throwing:
// a denom that cannot be resolved stays unpriced.
const extraDenomMeta = async (
  pool: PoolOverview,
  swaps: PoolSwap[]
): Promise<Record<string, ExtraDenomMeta>> => {
  const known = new Set(
    _.compact([
      ...pool.reserveCoins.map((c) => variantDenom(c)),
      pool.alloy.asset?.base,
    ])
  )
  const missing = _.uniq(swaps.flatMap((s) => [s.in.denom, s.out.denom])).filter(
    (d) => !known.has(d)
  )
  if (missing.length === 0) return {}
  const [meta, prices] = await Promise.all([
    getDenomMetaSafe(missing),
    Promise.all(missing.map((d) => getAssetPrice(d))),
  ])
  return _.fromPairs(
    _.compact(
      missing.map((denom, i) => {
        if (!meta[denom]) return null
        const price = Number(prices[i]?.amount)
        return [
          denom,
          {
            ...meta[denom],
            price: Number.isFinite(price) && price > 0 ? price : undefined,
          },
        ]
      })
    )
  )
}

// Never rejects: the table renders an error state instead of failing the page.
export const loadSwaps = async (pool: PoolOverview): Promise<SwapsResult> => {
  try {
    const swaps = await getPoolSwaps(pool.id)
    const [contractNames, extraDenoms] = await Promise.all([
      getContractNamesSafe(swaps.map((s) => s.contract)),
      extraDenomMeta(pool, swaps),
    ])
    return { ok: true, swaps, contractNames, extraDenoms }
  } catch (error) {
    console.error(`Failed to fetch swaps for pool ${pool.id}:`, error)
    return { ok: false }
  }
}
