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

// "alloy": an alloyed asset listed on the overview. "migration": an alloy that
// only converts a legacy token into its replacement 1:1 (allSTARS: STARS.og to
// STARS); its alloyed denom is plumbing, not a listed asset. Migration alloys
// have pool pages and their own section on /pools, but are not on the
// overview.
export type PoolKind = "alloy" | "migration"

export type PoolOverview = {
  id: string
  // Absent on overviews cached before kinds existed: treat as "alloy".
  kind?: PoolKind
  type: "cosmwasm-transmuter" | "cosmwasm"
  contractAddress: string
  codeId: string
  reserveCoins: {
    currency: CurrencyAmount
    asset: AssetWithDecimal
    // Origin chain and bridge/issuer, resolved through the chain registry.
    // Absent on overviews built before this existed or when resolution failed.
    provenance?: { origin: string | null; issuer: string | null } | null
  }[]
  spreadFactor: Rate
  totalFiatValueLocked: FiatAmount
  poolNameByDenom: string
  coinNames: string[][]
  // null when the pools API has no market data for the pool: unknown, which
  // must not be shown as $0.
  volume24hUsd: FiatAmount | null
  volume7dUsd: FiatAmount | null
  feesSpent24hUsd: FiatAmount | null
  feesSpent7dUsd: FiatAmount | null
  liquidityChart: {
    time: string
    value: number
  }[]
  prices: Record<string, number>
  alloy: {
    asset: AssetWithDecimal
    price: FiatAmount | null
  }
  // Limiters by variant denom (a denom can have several); null when the
  // limiter query failed (unknown, not "no limiters").
  limiters: _.Dictionary<Limiter[]> | null
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
  assetNames?: Record<string, string>
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
