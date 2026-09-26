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

// One color per group, in the order the Asset Sources chart draws them.
export const sourceColor = (index: number) =>
  `hsl(var(--chart-${(index % 5) + 1}))`

// The three ways the pool's backing can be grouped:
//   variant: the individual symbols (USDC.noble, WBTC.eth.axl)
//   issuer:  the bridge or minting provider (Axelar, Eureka, Circle, WBTC)
//   origin:  the chain of issue (Ethereum, Base, Bitcoin)
export type SourceGrouping = "variant" | "issuer" | "origin"
export const SOURCE_GROUPINGS: { value: SourceGrouping; label: string }[] = [
  { value: "variant", label: "Variant" },
  { value: "issuer", label: "Provider" },
  { value: "origin", label: "Origin" },
]

type SourceCoin = PoolOverview["reserveCoins"][number]

// Loose so both the pool overview's reserve coins and the asset cards' props
// can be passed.
type ProvenanceCoin = {
  asset?: { traces?: { counterparty?: { chain_name?: string } }[] } | null
  provenance?: { origin: string | null; issuer: string | null } | null
}

// Fallback when provenance is missing (older cached overview, registry
// fetch failed): the last IBC hop's chain, which is what the dashboard showed
// before provenance existed.
const lastHopLabel = (coin: ProvenanceCoin) => {
  const chain = _.last(coin.asset?.traces)?.counterparty?.chain_name
  return chain ? _.startCase(chain) : "Unknown"
}
export const variantIssuer = (coin: ProvenanceCoin) =>
  coin.provenance?.issuer ?? lastHopLabel(coin)
export const variantOrigin = (coin: ProvenanceCoin) =>
  coin.provenance?.origin ?? "Unknown"

const groupLabel = (coin: SourceCoin, by: SourceGrouping) =>
  by === "variant"
    ? (variantSymbol(coin) ?? "Unknown")
    : by === "issuer"
      ? variantIssuer(coin)
      : variantOrigin(coin)

// Reserve coins grouped by the chosen dimension, largest first. The pool page,
// the Asset Sources chart and the per-variant chart colors derive from this
// ordering so a group keeps the same color everywhere.
export const getPoolSources = (
  pool: PoolOverview,
  by: SourceGrouping = "issuer"
) =>
  _.chain(pool.reserveCoins)
    .map((a) => ({
      ...a,
      formattedAmount: reserveAmount(a.currency),
      group: groupLabel(a, by),
    }))
    .groupBy("group")
    .map((v, label) => ({
      assets: v,
      totalAmount: _.sumBy(v, "formattedAmount"),
      label,
    }))
    .sortBy((v) => -v.totalAmount)
    .value()

// Color for the index-th variant: the five palette colors, then the same
// colors darkened for a sixth or later variant.
export const variantColor = (index: number) =>
  index < 5
    ? sourceColor(index)
    : `color-mix(in srgb, ${sourceColor(index)} 60%, black)`

// Per-variant color: one palette color per variant, most prevalent first, so
// variants from the same provider (e.g. cbBTC.axl and WBTC.eth.axl) are as
// easy to tell apart as any others. The palette has five colors; a sixth or
// later variant reuses them, darkened.
export const getVariantStyles = (pool: PoolOverview) =>
  _.chain(getPoolSources(pool, "variant"))
    .flatMap((source, index) =>
      source.assets.map((a) => {
        return [
          variantDenom(a),
          { symbol: variantSymbol(a), color: variantColor(index) },
        ]
      })
    )
    .fromPairs()
    .value() as Record<string, { symbol: string; color: string }>
