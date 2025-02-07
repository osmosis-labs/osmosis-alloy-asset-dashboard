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
  const response = await fetch(BASE_MARKET_ASSET_URL.replace("{denom}", denom))
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
})

export const getAssetList = unstable_cache(
  async () => {
    const response = await fetch(BASE_ASSET_LIST)
    const data: Asset[] = await response.json().then((d) => d.assets)
    return data.map((a) => ({
      ...a,
      denom: _.first(a.denom_units)!.denom,
      decimal: _.last(a.denom_units)!.exponent || 6,
    })) as AssetWithDecimal[]
  },
  ["asset-list"],
  {
    revalidate: 1800,
  }
)

export const getAssetListUncached = async () => {
  const response = await fetch(BASE_ASSET_LIST)
  const data: Asset[] = await response.json().then((d) => d.assets)
  return data.map((a) => ({
    ...a,
    denom: _.first(a.denom_units)!.denom,
    decimal: _.last(a.denom_units)!.exponent || 6,
  })) as AssetWithDecimal[]
}

export const getAssetMap = cache(async () => {
  const assets = await getAssetList()
  return _.keyBy(assets, "base")
})

export const getAssetWithPrice = cache(async (denom: string) => {
  const response = await fetch(
    BASE_ASSET_WITH_PRICE_URL.replace("{denom}", denom)
  )
  const data = await response.json().then((d) => d.result.data.json)
  return {
    ...data,
    coinImageUrl: `${BASE_ASSET_URL}${data.coinImageUrl}`,
    currentPrice: JSON.parse(data.currentPrice),
  } as CurrencyWithPrice
})

export const getAssetPrice = cache(async (denom: string) => {
  try {
    const response = await fetch(BASE_ASSET_PRICE.replace("{denom}", denom))
    const data = await response.json().then((d) => d.result.data.json)
    return JSON.parse(data) as FiatAmount
  } catch (e) {
    return null
  }
})

export const getUserAssets = async (address: string) => {
  unstable_noStore()

  const limit = 100
  const offset = 0
  const response = await fetch(
    `https://lcd.osmosis.zone/cosmos/bank/v1beta1/spendable_balances/${address}?pagination.limit=${limit}&pagination.offset=${offset}`
  ).then((d) => d.json())

  return response.balances as Coin[]
}
