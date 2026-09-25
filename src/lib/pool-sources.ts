import BigNumber from "bignumber.js"
import _ from "lodash"

import { CurrencyAmount } from "@/types/asset"
import { PoolOverview } from "@/types/pool"

// Loose on purpose: callers pass reserve coins typed with Asset or
// AssetWithDecimal, and older cached overviews may lack either field.
type ReserveCoinLike = {
  currency?: CurrencyAmount
  asset?: { symbol?: string; base?: string } | null
}

export const reserveAmount = (a: CurrencyAmount) => {
  return new BigNumber(Number.isNaN(a.amount) ? 0 : a.amount)
    .shiftedBy(-(a.currency?.coinDecimals || 6))
    .toNumber()
}

// The symbol the Osmosis frontend shows for a variant (USDC.noble,
// WBTC.eth.axl). The frontend pools API builds `coinDenom` from the frontend
// assetlist; the chain-registry `symbol` is ambiguous across variants (three
// "WBTC"s in allBTC), so it is only a fallback.
export const variantSymbol = (coin: ReserveCoinLike) =>
  coin.currency?.currency?.coinDenom || coin.asset?.symbol

export const variantDenom = (coin: ReserveCoinLike) =>
  coin.currency?.currency?.coinMinimalDenom || coin.asset?.base

// One color per source, in the order the Asset Sources chart draws them.
export const sourceColor = (index: number) =>
  `hsl(var(--chart-${(index % 5) + 1}))`

// Reserve coins grouped by source chain, largest first. The pool page, the
// Asset Sources chart and the per-variant chart colors all derive from this
// one ordering so a source keeps the same color everywhere.
export const getPoolSources = (pool: PoolOverview) =>
  _.chain(pool.reserveCoins)
    .map((a) => ({
      ...a,
      formattedAmount: reserveAmount(a.currency),
      counterparty: _.last(a.asset?.traces)?.counterparty.chain_name,
    }))
    .groupBy("counterparty")
    .mapValues((v, k) => ({
      assets: v,
      totalAmount: _.sumBy(v, "formattedAmount"),
      counterparty: k,
    }))
    .sortBy((v) => -v.totalAmount)
    .value()

// Per-variant color: the variant's source color, darkened for the second and
// later variants from the same source (e.g. cbBTC.axl and WBTC.eth.axl) so they
// stay distinguishable while reading as one source.
export const getVariantStyles = (pool: PoolOverview) =>
  _.chain(getPoolSources(pool))
    .flatMap((source, sourceIndex) =>
      _.sortBy(source.assets, (a) => -a.formattedAmount).map((a, rank) => {
        const base = sourceColor(sourceIndex)
        return [
          variantDenom(a),
          {
            symbol: variantSymbol(a),
            color:
              rank === 0
                ? base
                : `color-mix(in srgb, ${base} ${Math.max(100 - rank * 25, 40)}%, black)`,
          },
        ]
      })
    )
    .fromPairs()
    .value() as Record<string, { symbol: string; color: string }>
