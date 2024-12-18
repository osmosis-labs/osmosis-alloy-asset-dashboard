import _ from "lodash"

import {
  Asset,
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
  poolNameByDenom: string
  coinNames: string[][]
  market?: {
    volume24hUsd?: string
    volume7dUsd?: string
    feesSpent24hUsd?: string
    feesSpent7dUsd?: string
  }
}

export type PoolOverview = {
  id: string
  type: "cosmwasm-transmuter" | "cosmwasm"
  contractAddress: string
  codeId: string
  reserveCoins: {
    currency: CurrencyAmount
    asset: AssetWithDecimal
  }[]
  spreadFactor: Rate
  totalFiatValueLocked: FiatAmount
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
  prices: Record<string, number>
  alloy: {
    asset: AssetWithDecimal
    price: FiatAmount | null
  }
  limiters: _.Dictionary<Limiter>
}

type Modify<T, R> = Omit<T, keyof R> & R

export type NotSupportedPoolOverview = Modify<
  PoolOverview,
  {
    alloy: {
      asset: null
      price: FiatAmount | null
    }
    limiters: null
  }
>

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
