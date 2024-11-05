import _ from "lodash"

import {
  AssetWithDecimal,
  Currency,
  CurrencyAmount,
  CurrencyWithMarketPrice,
  CurrencyWithPrice,
  FiatAmount,
  Rate,
} from "./asset"
import { Limiter } from "./limiter"

export type RawPoolOverview = {
  id: string
  type: "cosmwasm-transmuter" | "cosmwasm"
  raw: {
    contract_address: string
    code_id: string
    pool_id: string
    code_id: string
    instantiate_msg: string
  }
  reserveCoins: string[]
  spreadFactor: string
  totalFiatValueLocked: string
  coinDenoms: string[]
  poolNameByDenom: string
  coinNames: string[][]
  market?: {
    volume24hUsd?: string
    volume7dUsd?: string
    feesSpent24hUsd?: string
    feesSpent7dUsd?: string
  }
}

export type PoolAsset = {
  symbol: string
  amount: number
  denom: string
  coingecko_id: string
  liquidity: number
  liquidity_24h_change: number
  volume_24h: number
  volume_24h_change: number
  price: number
  price_24h_change: number
  fees: string
  asset: AssetWithDecimal
}
export type PoolOverview = {
  id: string
  type: "cosmwasm-transmuter" | "cosmwasm"
  contractAddress: string
  codeId: string
  reserveCoins: CurrencyAmount[]
  spreadFactor: Rate
  totalFiatValueLocked: FiatAmount
  coinDenoms: string[]
  poolNameByDenom: string
  coinNames: string[][]
  volume24hUsd: FiatAmount
  volume7dUsd: FiatAmount
  feesSpent24hUsd: FiatAmount
  feesSpent7dUsd: FiatAmount
  liquidityChart: {
    time: string
    value: number
  }[]
  assets: PoolAsset[] | null
  alloy: {
    asset: AssetWithDecimal
    price: FiatAmount | null
  }
  limiters: _.Dictionary<Limiter>
}

export type NotSupportedPoolOverview = PoolOverview & {
  assets:
    | (PoolAsset & {
        asset: AssetWithDecimal | null
      })[]
    | null
  alloy: {
    asset: null
    price: FiatAmount | null
  }
  limiters: null
}

export type PoolInOutAssets = {
  timestamp: string
  count: number
  in: {
    [key: string]: string
  }
  out: {
    [key: string]: string
  }
}

export type MinimalPool = {
  id: string
  assets: string[]
  alloy: {
    asset: string
    price: string
  }
}

export type MinimalAssetPool = {
  id: string
  assets: AssetWithDecimal[]
  alloy: {
    asset: AssetWithDecimal
    price: string
  }
}
