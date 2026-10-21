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

// Display amount of a reserve coin. Pools whose coins lack decimals are
// classified unsupported (src/services/pool.ts), so coinDecimals is always
// set here; a real 0 is kept (it used to become 6).
export const reserveAmount = (a: CurrencyAmount) => {
  return new BigNumber(a.amount).shiftedBy(-a.currency.coinDecimals).toNumber()
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

// Per-variant color: one palette color per variant, so variants from the same
// provider (e.g. cbBTC.axl and WBTC.eth.axl) are as easy to tell apart as any
// others. Colors follow the variants' denoms in sorted order, not their share
// of the pool, so a variant keeps its color when a rebalance changes which
// holds the most. The palette has five colors; a sixth or later variant
// reuses them, darkened.
export const getVariantStyles = (pool: PoolOverview) => {
  const denoms = _.sortBy(
    _.uniq(pool.reserveCoins.map((c) => variantDenom(c)).filter(Boolean))
  ) as string[]
  return _.chain(getPoolSources(pool, "variant"))
    .flatMap((source) =>
      source.assets.map((a) => {
        const denom = variantDenom(a)!
        return [
          denom,
          {
            symbol: variantSymbol(a),
            color: variantColor(denoms.indexOf(denom)),
          },
        ]
      })
    )
    .fromPairs()
    .value() as Record<string, { symbol: string; color: string }>
}

// The value of a pool's backing in USD. Each variant is valued at its own
// price, so a variant trading below the alloy counts for what it is worth.
// A variant with no price of its own is valued at the alloy price and named
// in `atAlloyPrice`. Variants that cannot back the alloy are left out and
// listed in `unbacked`: corrupted ones (they can only leave the pool) and ones
// the assetlist has halted in both directions. `usd` is null when a backed
// variant has no price at all (neither its own nor the alloy's).
export type PoolBacking = {
  usd: number | null
  atAlloyPrice: string[]
  unbacked: string[]
}

export const poolBacking = (
  pool: Pick<PoolOverview, "reserveCoins" | "prices" | "alloy" | "status">
): PoolBacking => {
  const alloyPrice = pool.alloy.price ? Number(pool.alloy.price.amount) : null
  const corrupted = pool.status?.corruptedDenoms ?? []
  const backing: PoolBacking = { usd: 0, atAlloyPrice: [], unbacked: [] }
  for (const coin of pool.reserveCoins ?? []) {
    const denom = variantDenom(coin) ?? ""
    const symbol = variantSymbol(coin) ?? denom
    const flags = pool.status?.reserves?.[denom]
    if (
      corrupted.includes(denom) ||
      (flags?.haltDeposits && flags?.haltWithdrawals)
    ) {
      backing.unbacked.push(symbol)
      continue
    }
    const own = pool.prices?.[denom]
    let price: number | null = null
    if (own !== undefined && Number.isFinite(own)) {
      price = own
    } else if (alloyPrice !== null && Number.isFinite(alloyPrice)) {
      price = alloyPrice
      backing.atAlloyPrice.push(symbol)
    }
    if (price === null) {
      backing.usd = null
    } else if (backing.usd !== null) {
      backing.usd += price * reserveAmount(coin.currency)
    }
  }
  return backing
}

// One line explaining how a backing figure was valued, or null when every
// variant counted at its own price.
export const backingNote = ({ atAlloyPrice, unbacked }: PoolBacking) =>
  _.compact([
    atAlloyPrice.length > 0 && `${atAlloyPrice.join(", ")} at the alloy price`,
    unbacked.length > 0 && `excludes ${unbacked.join(", ")} (unbacked)`,
  ]).join("; ") || null
