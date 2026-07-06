import { cache } from "react"
import { unstable_cache, unstable_noStore } from "next/cache"
import _ from "lodash"

import {
  Asset,
  AssetWithDecimal,
  Coin,
  CurrencyWithMarketPrice,
  CurrencyWithPrice,
  FiatAmount,
} from "@/types/asset"
import { fetchWithRetry } from "@/lib/utils"

const BASE_ASSET_WITH_PRICE_URL =
  "https://app.osmosis.zone/api/edge-trpc-assets/assets.getAssetWithPrice?input=%7B%22json%22:%7B%22findMinDenomOrSymbol%22:%22{denom}%22%7D%7D"
const BASE_ASSET_PRICE =
  "https://app.osmosis.zone/api/edge-trpc-assets/assets.getAssetPrice?input=%7B%22json%22:%7B%22coinMinimalDenom%22:%22{denom}%22%7D%7D"
const BASE_ASSET_URL = "https://app.osmosis.zone"
const BASE_ASSET_LIST =
  "https://raw.githubusercontent.com/osmosis-labs/assetlists/main/osmosis-1/generated/chain_registry/assetlist.json"
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
// cache for the whole revalidate window. Fetches go through fetchWithRetry
// because the 1.7MB list occasionally responds slowly or drops the first
// connection, and a single un-retried failure here blanks the Supported table.
const fetchAssetList = async (): Promise<AssetWithDecimal[]> => {
  const response = await fetchWithRetry(BASE_ASSET_LIST, { timeoutMs: 20000 })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch asset list: ${response.status} ${response.statusText}`
    )
  }

  const data: Asset[] = await response.json().then((d) => d.assets)
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
