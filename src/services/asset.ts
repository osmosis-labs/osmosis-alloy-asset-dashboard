import { cache } from "react"
import { unstable_cache, unstable_noStore } from "next/cache"
import _ from "lodash"

import {
  Asset,
  AssetStatus,
  AssetWithDecimal,
  Coin,
  CurrencyWithMarketPrice,
  CurrencyWithPrice,
  FiatAmount,
} from "@/types/asset"
import { fetchJsonWithRetry } from "@/lib/utils"

const BASE_ASSET_WITH_PRICE_URL =
  "https://app.osmosis.zone/api/edge-trpc-assets/assets.getAssetWithPrice?input=%7B%22json%22:%7B%22findMinDenomOrSymbol%22:%22{denom}%22%7D%7D"
const BASE_ASSET_PRICE =
  "https://app.osmosis.zone/api/edge-trpc-assets/assets.getAssetPrice?input=%7B%22json%22:%7B%22coinMinimalDenom%22:%22{denom}%22%7D%7D"
const BASE_ASSET_URL = "https://app.osmosis.zone"
const BASE_ASSET_LIST =
  "https://raw.githubusercontent.com/osmosis-labs/assetlists/main/osmosis-1/generated/chain_registry/assetlist.json"
// Frontend-flavoured generated list: same assets, but carrying the operational
// flags (unstable, halted deposits/withdrawals, tooltipMessage) that the
// chain-registry-format list above does not.
const BASE_FRONTEND_ASSET_LIST =
  "https://raw.githubusercontent.com/osmosis-labs/assetlists/main/osmosis-1/generated/frontend/assetlist.json"
// jsDelivr mirrors of the same files, tried only after raw.githubusercontent.com
// has exhausted its retries. jsDelivr can lag `main` by a few hours, which is
// fine for a fallback: the lists change slowly.
const ASSETLIST_MIRROR_BASE =
  "https://cdn.jsdelivr.net/gh/osmosis-labs/assetlists@main/osmosis-1/generated"
const MIRROR_ASSET_LIST = `${ASSETLIST_MIRROR_BASE}/chain_registry/assetlist.json`
const MIRROR_FRONTEND_ASSET_LIST = `${ASSETLIST_MIRROR_BASE}/frontend/assetlist.json`
const BASE_MARKET_ASSET_URL =
  "https://app.osmosis.zone/api/edge-trpc-assets/assets.getMarketAssets?input=%7B%22json%22:%7B%22limit%22:50,%22search%22:%7B%22query%22:%22{denom}%22%7D,%22onlyVerified%22:false,%22includePreview%22:false,%22sort%22:null,%22watchListDenoms%22:%5B%5D,%22categories%22:null,%22cursor%22:0%7D,%22meta%22:%7B%22values%22:%7B%22sort%22:%5B%22undefined%22%5D,%22categories%22:%5B%22undefined%22%5D%7D%7D%7D"

export const getAssetWithMarketPrice = cache(async (denom: string) => {
  try {
    const response = await fetch(
      BASE_MARKET_ASSET_URL.replace("{denom}", denom)
    )

    if (!response.ok) {
      console.warn(
        `Failed to fetch asset with market price: ${response.status} ${response.statusText}`
      )
      return null
    }

    const data = await response.json().then((d) => d.result.data.json.items[0])
    return {
      ...data,
      coinImageUrl: `${BASE_ASSET_URL}${data.coinImageUrl}`,
      currentPrice: JSON.parse(data.currentPrice),
      marketCap: JSON.parse(data.marketCap),
      liquidity: data.liquidity ? JSON.parse(data.liquidity) : null,
      priceChange1h: JSON.parse(data.priceChange1h),
      priceChange24h: JSON.parse(data.priceChange24h),
      priceChange7d: JSON.parse(data.priceChange7d),
      volume24h: JSON.parse(data.volume24h),
    } as CurrencyWithMarketPrice
  } catch (e) {
    console.error(`Error fetching asset with market price: ${e}`)
    return null
  }
})

// The asset list gates EVERY pool's supported/unsupported classification: a
// pool is "supported" only if its alloyed denom resolves to an entry here. So
// an empty list silently demotes every pool to unsupported. To avoid caching
// that failure, this THROWS on a fetch/parse failure or an empty list rather
// than returning []. `unstable_cache` does not persist a thrown error, so the
// previous good list keeps being served instead of an empty one poisoning the
// cache for the whole revalidate window. Fetches go through fetchJsonWithRetry
// because the 1.7MB list occasionally responds slowly or drops the connection
// mid-body, and a single un-retried failure here blanks the Supported table.
const fetchAssetList = async (): Promise<AssetWithDecimal[]> => {
  const data = await fetchJsonWithRetry<{ assets: Asset[] }>(
    [BASE_ASSET_LIST, MIRROR_ASSET_LIST],
    { timeoutMs: 20000 }
  ).then((d) => d?.assets)
  if (!_.isArray(data) || data.length === 0) {
    throw new Error("Asset list fetch returned no assets")
  }

  return data.map((a) => ({
    ...a,
    denom: _.first(a.denom_units)!.denom,
    decimal: _.last(a.denom_units)!.exponent || 6,
  })) as AssetWithDecimal[]
}

export const getAssetList = unstable_cache(fetchAssetList, ["asset-list"], {
  revalidate: 1800,
})

// Non-throwing variant for callers that must not fail the whole render if the
// list is briefly unavailable. Prefer getAssetList (cached) for classification.
export const getAssetListSafe = async (): Promise<AssetWithDecimal[]> => {
  try {
    return await getAssetList()
  } catch (e) {
    console.error(`Error fetching asset list: ${e}`)
    return []
  }
}

export const getAssetListUncached = async () => {
  try {
    return await fetchAssetList()
  } catch (e) {
    console.error(`Error fetching asset list (uncached): ${e}`)
    return []
  }
}

type FrontendAsset = {
  coinMinimalDenom: string
  name?: string
  symbol?: string
  unstable?: boolean
  unstableReason?: string | null
  disabled?: boolean
  haltDeposits?: boolean | null
  haltWithdrawals?: boolean | null
  depositHaltReason?: string | null
  withdrawalHaltReason?: string | null
  tooltipMessage?: string | null
  lastDowntimeDate?: string | null
}

type FrontendAssetMeta = {
  // Status flags keyed by minimal denom. Only assets that carry at least one
  // flag are kept, so a lookup miss means "no flags", not "unknown".
  statusMap: Record<string, AssetStatus>
  // Display names as the Osmosis frontend shows them ("USDC (Noble)"), keyed
  // by minimal denom. The chain-registry list names several variants alike.
  names: Record<string, string>
  // Frontend symbols ("USDC.noble") by minimal denom, for denoms no longer in
  // a pool (removed variants in the reserve history).
  symbols: Record<string, string>
}

// One download of the ~2.5MB frontend list feeds both maps.
const fetchFrontendAssetMeta = async (): Promise<FrontendAssetMeta> => {
  const data = await fetchJsonWithRetry<{ assets: FrontendAsset[] }>(
    [BASE_FRONTEND_ASSET_LIST, MIRROR_FRONTEND_ASSET_LIST],
    { timeoutMs: 20000 }
  ).then((d) => d?.assets)
  if (!_.isArray(data) || data.length === 0) {
    throw new Error("Frontend asset list fetch returned no assets")
  }

  const map: Record<string, AssetStatus> = {}
  const names: Record<string, string> = {}
  const symbols: Record<string, string> = {}
  for (const a of data) {
    if (a.coinMinimalDenom && a.name) {
      names[a.coinMinimalDenom] = a.name
    }
    if (a.coinMinimalDenom && a.symbol) {
      symbols[a.coinMinimalDenom] = a.symbol
    }
    const status: AssetStatus = {
      unstable: a.unstable === true,
      unstableReason: a.unstableReason ?? null,
      disabled: a.disabled === true,
      haltDeposits: a.haltDeposits === true,
      haltWithdrawals: a.haltWithdrawals === true,
      depositHaltReason: a.depositHaltReason ?? null,
      withdrawalHaltReason: a.withdrawalHaltReason ?? null,
      tooltipMessage: a.tooltipMessage?.trim() || null,
      lastDowntimeDate: a.lastDowntimeDate ?? null,
    }
    const flagged =
      status.unstable ||
      status.disabled ||
      status.haltDeposits ||
      status.haltWithdrawals ||
      !!status.tooltipMessage
    if (flagged && a.coinMinimalDenom) {
      map[a.coinMinimalDenom] = status
    }
  }
  return { statusMap: map, names, symbols }
}

const getFrontendAssetMeta = unstable_cache(
  fetchFrontendAssetMeta,
  ["frontend-asset-meta-v2"],
  { revalidate: 1800 }
)

export const getAssetStatusMap = async () =>
  (await getFrontendAssetMeta()).statusMap

// Non-throwing: a missing symbol map only falls back to chain-registry symbols.
export const getFrontendAssetSymbolsSafe = async (): Promise<
  Record<string, string>
> => {
  try {
    return (await getFrontendAssetMeta()).symbols
  } catch (e) {
    console.error(`Error fetching frontend asset symbols: ${e}`)
    return {}
  }
}

// Non-throwing: a missing name map only falls back to chain-registry names.
export const getFrontendAssetNamesSafe = async (): Promise<
  Record<string, string>
> => {
  try {
    return (await getFrontendAssetMeta()).names
  } catch (e) {
    console.error(`Error fetching frontend asset names: ${e}`)
    return {}
  }
}

// Non-throwing variant. The status flags are supplementary: the authoritative
// frozen signal is the contract's own is_active query, so a missing map only
// hides the assetlist tooltips, it never claims a pool is healthy. Like
// getAssetList, the cached function throws on failure so an empty map is never
// cached over a good one.
export const getAssetStatusMapSafe = async (): Promise<
  Record<string, AssetStatus>
> => {
  try {
    return await getAssetStatusMap()
  } catch (e) {
    console.error(`Error fetching asset status map: ${e}`)
    return {}
  }
}

export const getAssetMap = cache(async () => {
  // Uses the cached, throw-on-failure getAssetList so a transient assetlist
  // outage cannot produce an empty map (which would mark every pool
  // unsupported). Callers of getAssetMap must handle a thrown error; the pool
  // overview build treats an unavailable map as a build failure and falls back
  // to the last-known-good snapshot rather than caching an all-unsupported set.
  const assets = await getAssetList()
  return _.keyBy(assets, "base")
})

export const getAssetWithPrice = cache(async (denom: string) => {
  try {
    const response = await fetch(
      BASE_ASSET_WITH_PRICE_URL.replace("{denom}", denom)
    )

    if (!response.ok) {
      console.warn(
        `Failed to fetch asset with price: ${response.status} ${response.statusText}`
      )
      return null
    }

    const data = await response.json().then((d) => d.result.data.json)
    return {
      ...data,
      coinImageUrl: `${BASE_ASSET_URL}${data.coinImageUrl}`,
      currentPrice: JSON.parse(data.currentPrice),
    } as CurrencyWithPrice
  } catch (e) {
    console.error(`Error fetching asset with price: ${e}`)
    return null
  }
})

export const getAssetPrice = cache(async (denom: string) => {
  try {
    const response = await fetch(BASE_ASSET_PRICE.replace("{denom}", denom))

    if (!response.ok) {
      console.warn(
        `Failed to fetch asset price: ${response.status} ${response.statusText}`
      )
      return null
    }

    const data = await response.json().then((d) => d.result.data.json)
    return JSON.parse(data) as FiatAmount
  } catch (e) {
    console.error(`Error fetching asset price: ${e}`)
    return null
  }
})

export const getUserAssets = async (address: string) => {
  unstable_noStore()

  try {
    const limit = 100
    const offset = 0
    const response = await fetch(
      `https://lcd.osmosis.zone/cosmos/bank/v1beta1/spendable_balances/${address}?pagination.limit=${limit}&pagination.offset=${offset}`
    )

    if (!response.ok) {
      console.error(
        `Failed to fetch user assets: ${response.status} ${response.statusText}`
      )
      return []
    }

    const data = await response.json()
    return data.balances as Coin[]
  } catch (e) {
    console.error(`Error fetching user assets: ${e}`)
    return []
  }
}
