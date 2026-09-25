import _ from "lodash"

import {
  Asset,
  AssetStatus,
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

// Onchain operational state of the transmuter contract behind a pool, plus the
// assetlist status flags for the alloyed denom and each constituent.
export type PoolStatus = {
  // `is_active` smart query. false = the moderator has frozen the pool: joins,
  // swaps in either direction and exit_pool are all rejected. null = the query
  // failed, in which case the UI must say "unknown", never assume active.
  isActive: boolean | null
  // `get_corrupted_denoms` smart query. A corrupted constituent can never
  // increase in amount or weight; it can only leave the pool. null = the query
  // failed or the code id does not support it.
  corruptedDenoms: string[] | null
  // Frontend-assetlist flags for the alloyed denom itself.
  alloy: AssetStatus | null
  // Frontend-assetlist flags per constituent, keyed by minimal denom.
  reserves: Record<string, AssetStatus>
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
  status: PoolStatus
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
    status: null
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

// Subset of PoolStatus the swap page needs to refuse actions a frozen
// contract would reject anyway.
export type MinimalPoolStatus = Pick<PoolStatus, "isActive" | "corruptedDenoms">

export type MinimalPool = {
  id: string
  assets: string[]
  assetSymbols?: Record<string, string>
  alloy: {
    asset: string
    price: string
  }
  status: MinimalPoolStatus
}

export type MinimalAssetPool = {
  id: string
  assets: AssetWithDecimal[]
  alloy: {
    asset: AssetWithDecimal
    price: string
  }
  status: MinimalPoolStatus
}
