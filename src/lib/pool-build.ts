// Pure helpers for building pool overviews (src/services/pool.ts) and the
// assetlist (src/services/asset.ts). No Next.js or path-alias imports, so the
// node:test suite (scripts/test-pools.mts) can load this file directly.
import type {
  Asset,
  AssetWithDecimal,
  Currency,
  CurrencyAmount,
} from "../types/asset"
import type { RawPoolOverview } from "../types/pool"

const APP_URL = "https://app.osmosis.zone"

// Migration alloys (src/constants/migration.ts) are listed apart from the
// alloys; see PoolKind.
export const isMigrationPool = (pool: { kind?: string }) =>
  pool.kind === "migration"

// Exponent of the display unit, matched by denom or alias; null if absent.
export const displayExponent = (a: Asset): number | null => {
  const unit = a.denom_units.find(
    (u) =>
      u.denom === a.display ||
      (u as { aliases?: string[] }).aliases?.includes(a.display)
  )
  return typeof unit?.exponent === "number" ? unit.exponent : null
}

// A market figure from the pools API, or null when it has none for the pool
// (unknown, which must not be shown as $0).
export const marketFiat = (value?: string) => (value ? JSON.parse(value) : null)

// The pools API gives app-relative image paths; pools built from chain data
// (getMigrationRawPools) carry absolute ones.
export const appImageUrl = (url: string | undefined) =>
  url?.startsWith("/") ? `${APP_URL}${url}` : (url ?? "")

type ParsedReserveCoin = Omit<CurrencyAmount, "currency"> & {
  currency: Currency & { coinName?: string }
}

export const parseReserveCoins = (pool: RawPoolOverview) =>
  pool.reserveCoins.map((coin) => JSON.parse(coin) as ParsedReserveCoin)

// The alloy asset of a migration pool. Its alloyed denom has no assetlist
// entry, so it is described from the pool's two variants: named after the
// replacement token, with its image. Undefined (the pool is then listed as
// unsupported) unless both configured variants are in the pool with the same
// decimals.
export const migrationAlloyAsset = (
  pool: RawPoolOverview,
  alloyDenom: string,
  migration: { from: string; to: string },
  assetMap: Record<string, AssetWithDecimal>
): AssetWithDecimal | undefined => {
  const coins = parseReserveCoins(pool).map((c) => c.currency)
  const from = coins.find((c) => c.coinMinimalDenom === migration.from)
  const to = coins.find((c) => c.coinMinimalDenom === migration.to)
  if (!from || !to || from.coinDecimals !== to.coinDecimals) return undefined
  const symbol = alloyDenom.split("/").at(-1)!
  const toName =
    to.coinName ?? assetMap[to.coinMinimalDenom]?.name ?? to.coinDenom
  const fromName =
    from.coinName ?? assetMap[from.coinMinimalDenom]?.name ?? from.coinDenom
  return {
    base: alloyDenom,
    denom: alloyDenom,
    display: symbol,
    symbol,
    name: `${toName} Migration`,
    description: `Swaps ${from.coinDenom} (${fromName}) for ${to.coinDenom} 1:1. This pool exists for the token migration: its alloyed token, ${symbol}, is not a listed asset.`,
    denom_units: [
      { denom: alloyDenom, exponent: 0 },
      { denom: symbol, exponent: to.coinDecimals },
    ],
    decimal: to.coinDecimals,
    type_asset: "sdk.coin",
    address: pool.raw.contract_address,
    traces: [],
    images: assetMap[to.coinMinimalDenom]?.images ?? [],
    keywords: [],
  }
}
