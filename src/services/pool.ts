import { cache } from "react"
import { unstable_cache } from "next/cache"
import BigNumber from "bignumber.js"
import _ from "lodash"

import { env } from "@/env.mjs"
import { AssetWithDecimal } from "@/types/asset"
import {
  MinimalPool,
  NotSupportedPoolOverview,
  PoolInOutAssets,
  PoolOverview,
  RawPoolOverview,
} from "@/types/pool"
import dayjs from "@/lib/dayjs"

import { getAssetMap, getAssetPrice } from "./asset"
import { getLimiters } from "./limiter"

const MIN_LIQUIDITY = 10
const BASE_POOLS_URL = `https://app.osmosis.zone/api/edge-trpc-pools/pools.getPools?input=%7B%22json%22%3A%7B%22limit%22%3A100%2C%22types%22%3A%5B%22cosmwasm%22%2C%22cosmwasm-alloyed%22%5D%2C%22minLiquidityUsd%22%3A${MIN_LIQUIDITY}%7D%7D`
const BASE_ASSET_URL = "https://app.osmosis.zone"
const BASE_LIQUIDITY_CHART_URL =
  "https://public-osmosis-api.numia.xyz/pools/liquidity/{poolId}/over_time"
const BASE_PRICE_URL = "https://sqs.osmosis.zone/tokens/prices?base={denoms}"

const ZERO_FIAT = {
  fiat: {
    currency: "usd",
    symbol: "$",
    maxDecimals: 2,
    locale: "en-US",
  },
  options: {
    maxDecimals: 2,
    trim: true,
    shrink: true,
    ready: true,
    locale: "en-US",
    inequalitySymbol: true,
    inequalitySymbolSeparator: " ",
    separator: "",
    upperCase: false,
    lowerCase: false,
  },
  amount: "0",
}

const fillPoolOverview = async (
  pool: RawPoolOverview,
  assetMap?: _.Dictionary<AssetWithDecimal>
) => {
  if (!assetMap) {
    assetMap = await getAssetMap()
  }

  const alloyDenom = calculdateAlloyAssetDenom(
    pool.raw.contract_address,
    pool.raw.instantiate_msg
  )

  const alloyAssetDetail = assetMap[alloyDenom]

  if (!alloyAssetDetail || pool.reserveCoins.length <= 1) {
    return {
      id: pool.id,
      type: pool.type,
      codeId: pool.raw.code_id,
      contractAddress: pool.raw.contract_address,
      reserveCoins: pool.reserveCoins.map((coin) => {
        const c = JSON.parse(coin)
        return {
          asset: assetMap[c.currency.coinMinimalDenom],
          currency: {
            ...c,
            currency: {
              ...c.currency,
              coinImageUrl: `${BASE_ASSET_URL}${c.currency.coinImageUrl}`,
            },
          },
        }
      }),
      spreadFactor: JSON.parse(pool.spreadFactor),
      totalFiatValueLocked: JSON.parse(pool.totalFiatValueLocked),
      poolNameByDenom: pool.poolNameByDenom,
      coinNames: pool.coinNames,
      volume24hUsd: pool.market?.volume24hUsd
        ? JSON.parse(pool.market?.volume24hUsd)
        : ZERO_FIAT,
      volume7dUsd: pool.market?.volume7dUsd
        ? JSON.parse(pool.market?.volume7dUsd)
        : ZERO_FIAT,
      feesSpent24hUsd: pool.market?.feesSpent24hUsd
        ? JSON.parse(pool.market.feesSpent24hUsd)
        : ZERO_FIAT,
      feesSpent7dUsd: pool.market?.feesSpent7dUsd
        ? JSON.parse(pool.market.feesSpent7dUsd)
        : ZERO_FIAT,
      prices: {},
      liquidityChart: [],
      assets: null,
      alloy: {
        asset: null,
        price: null,
      },
      limiters: null,
    } as NotSupportedPoolOverview
  }

  const [liquidityChart, prices, limiters] = await Promise.all([
    fetch(BASE_LIQUIDITY_CHART_URL.replace("{poolId}", pool.id))
      .then(async (d) => {
        if (!d.ok) {
          console.warn(`Failed to fetch liquidity chart: ${d.status} ${d.statusText}`)
          return []
        }
        try {
          return await d.json()
        } catch (e) {
          console.warn(`Failed to parse liquidity chart JSON: ${e}`)
          return []
        }
      })
      .then((d) => (!d || !_.isArray(d) ? [] : d))
      .then((d) =>
        d
          .map((v) => ({
            time: v.timestamp,
            value: v.liquidity_usd,
          }))
          .slice(1)
      )
      .catch((e) => {
        console.error(`Error fetching liquidity chart: ${e}`)
        return []
      }),
    fetch(
      BASE_PRICE_URL.replace(
        "{denoms}",
        pool.reserveCoins
          .map((coin) => JSON.parse(coin).currency.coinMinimalDenom)
          .join(",")
      )
    )
      .then(async (d) => {
        if (!d.ok) {
          console.warn(`Failed to fetch prices: ${d.status} ${d.statusText}`)
          return {}
        }
        try {
          return await d.json()
        } catch (e) {
          console.warn(`Failed to parse prices JSON: ${e}`)
          return {}
        }
      })
      .then((d) =>
        _.chain(d)
          .mapValues((v) => _.values(v)[0])
          .value()
      )
      .catch((e) => {
        console.error(`Error fetching prices: ${e}`)
        return {}
      }),
    getLimiters(pool.raw.contract_address),
  ])
  let alloyAssetPrice = await getAssetPrice(alloyDenom)
  if (alloyAssetPrice && Number(alloyAssetPrice?.amount) > 1000000)
    alloyAssetPrice = null
  if (!alloyAssetPrice) {
    const foundAssetPrice = _.chain(prices).values().compact().mean().value()
    if (foundAssetPrice) {
      alloyAssetPrice = {
        fiat: {
          currency: "usd",
          symbol: "$",
          maxDecimals: 2,
          locale: "en-US",
        },
        options: {
          maxDecimals: 2,
          trim: true,
          shrink: true,
          ready: true,
          locale: "en-US",
          inequalitySymbol: true,
          inequalitySymbolSeparator: " ",
          separator: "",
          upperCase: false,
          lowerCase: false,
        },
        amount: String(foundAssetPrice),
      }
    }
  }

  return {
    id: pool.id,
    type: pool.type,
    codeId: pool.raw.code_id,
    contractAddress: pool.raw.contract_address,
    reserveCoins: pool.reserveCoins.map((coin) => {
      const c = JSON.parse(coin)
      return {
        asset: assetMap[c.currency.coinMinimalDenom],
        currency: {
          ...c,
          currency: {
            ...c.currency,
            coinImageUrl: `${BASE_ASSET_URL}${c.currency.coinImageUrl}`,
          },
        },
      }
    }),
    spreadFactor: JSON.parse(pool.spreadFactor),
    totalFiatValueLocked: JSON.parse(pool.totalFiatValueLocked),
    poolNameByDenom: pool.poolNameByDenom,
    coinNames: pool.coinNames,
    volume24hUsd: pool.market?.volume24hUsd
      ? JSON.parse(pool.market?.volume24hUsd)
      : ZERO_FIAT,
    volume7dUsd: pool.market?.volume7dUsd
      ? JSON.parse(pool.market?.volume7dUsd)
      : ZERO_FIAT,
    feesSpent24hUsd: pool.market?.feesSpent24hUsd
      ? JSON.parse(pool.market.feesSpent24hUsd)
      : ZERO_FIAT,
    feesSpent7dUsd: pool.market?.feesSpent7dUsd
      ? JSON.parse(pool.market.feesSpent7dUsd)
      : ZERO_FIAT,
    liquidityChart,
    prices,
    //assets: assets?.map((a: any) => ({
    //...a,
    //asset: assetMap[a.denom],
    //})),
    alloy: {
      asset: alloyAssetDetail,
      price: alloyAssetPrice,
    },
    limiters,
  } as PoolOverview
}

export const getRawPoolsOverview = async () => {
  const response = await fetch(BASE_POOLS_URL)

  if (!response.ok) {
    console.error(`Failed to fetch pools overview: ${response.status} ${response.statusText}`)
    return []
  }

  try {
    const data = await response
      .json()
      .then((d) => d.result.data.json.items as RawPoolOverview[])
      .then((d) =>
        d.filter((pool) => env.NEXT_PUBLIC_CODE_IDS.includes(pool.raw.code_id))
      )

    return data
  } catch (e) {
    console.error(`Failed to parse pools overview JSON: ${e}`)
    return []
  }
}

export const getPoolsOverview = unstable_cache(
  async () => {
    const data = await getRawPoolsOverview()
    const assetMap = await getAssetMap()
    const pools = await Promise.all(
      data.map((p) => fillPoolOverview(p, assetMap))
    )

    return {
      pools: pools.filter((p) => p.alloy.asset) as PoolOverview[],
      unsupportedPools: pools.filter(
        (p) => !p.alloy.asset
      ) as NotSupportedPoolOverview[],
    }
  },
  ["pools-overview"],
  {
    revalidate: 1800,
  }
)

export const getPoolOverview = unstable_cache(
  async (poolId: string) => {
    const pools = await getPoolsOverview()
    return pools.pools.find((p) => p.id === poolId)
  },
  ["pool-overview"],
  {
    revalidate: 1800,
  }
)

export const getPoolsFromAPI = async () => {
  return await fetch("/api/pools").then((res) =>
    res.json().then((d) => d as MinimalPool[])
  )
}

const calculdateAlloyAssetDenom = (
  contractAddress: string,
  instantiateMsg: string
) => {
  const base64 = atob(instantiateMsg)
  const decoded = JSON.parse(base64)
  return `factory/${contractAddress}/alloyed/${decoded.alloyed_asset_subdenom}`
}

export const getPoolInOutTxs = cache(async (poolId: string) => {
  const dayAgo = dayjs.utc().subtract(1, "day").format()

  // Try to get height from GraphQL endpoint (may be blocked by CORS in local dev)
  let height: number
  try {
    const response = await fetch(
      "https://osmosis-1-graphql.alleslabs.dev/v1/graphql",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            query Blocks($where: blocks_bool_exp) {
              blocks(where: $where, order_by: {height: desc}, limit: 1) {
                height
              }
            }`,
          variables: {
            where: {
              timestamp: {
                _lte: dayAgo,
              },
            },
          },
        }),
      }
    )

    if (!response.ok) {
      throw new Error(`GraphQL endpoint returned ${response.status}`)
    }

    const data = await response.json()
    height = data.data.blocks[0].height as number
  } catch (error) {
    // Fallback: Calculate approximate height based on current block
    // Osmosis has ~1.2 second block time, so 24h = ~72,000 blocks
    console.warn("GraphQL endpoint unavailable, using block-based fallback", error)
    const BLOCKS_PER_DAY = 72000

    try {
      const heightResponse = await fetch(
        "https://lcd.osmosis.zone/cosmos/base/tendermint/v1beta1/blocks/latest"
      )

      if (!heightResponse.ok) {
        throw new Error(`LCD endpoint returned ${heightResponse.status}`)
      }

      const heightData = await heightResponse.json()
      const currentHeight = Number(heightData.block.header.height)
      height = currentHeight - BLOCKS_PER_DAY
    } catch (fallbackError) {
      console.error("Failed to fetch block height from LCD endpoint", fallbackError)
      throw new Error(
        "Unable to determine block height: both GraphQL and LCD endpoints failed"
      )
    }
  }

  try {
    const url = `https://lcd.osmosis.zone/cosmos/tx/v1beta1/txs?query=token_swapped.pool_id=${poolId}&query=tx.height>=${height}&order_by=2`
    const totalResponse = await fetch(`${url}&limit=1`)

    if (!totalResponse.ok) {
      console.error(`Failed to fetch tx count: ${totalResponse.status} ${totalResponse.statusText}`)
      return { total: 0, txs: [] }
    }

    const totalData = await totalResponse.json()
    const total = Number(totalData.total)

    const limit = 100
    const pages = Math.min(Math.ceil(total / limit), 10)
    const txs = await Promise.all(
      _.range(1, pages + 1).map(async (page) => {
        try {
          const response = await fetch(`${url}&limit=${limit}&page=${page}`)
          if (!response.ok) {
            console.warn(`Failed to fetch tx page ${page}: ${response.status}`)
            return []
          }
          const data = await response.json()
          return data.tx_responses
        } catch (e) {
          console.warn(`Error fetching tx page ${page}: ${e}`)
          return []
        }
      })
    )

    return {
      total,
      txs: txs.flat(),
    }
  } catch (e) {
    console.error(e)
    throw e
  }
})

const ASSET_AMOUNT_REGEX = /([0-9]+)(.+)/
export const getPoolInOutAssets = unstable_cache(
  async (poolId: string): Promise<PoolInOutAssets[]> => {
    const { txs } = await getPoolInOutTxs(poolId)
    const groupped = _.chain(txs)
      .flatMap((tx) =>
        _.chain(tx?.events)
          .filter(
            (e: any) =>
              e.type === "token_swapped" &&
              _.some(
                e.attributes,
                (a: any) => a.key === "pool_id" && a.value === poolId
              )
          )
          .map((e: any) => {
            const [, amountIn, denomIn] = (
              _.find(e.attributes, ["key", "tokens_in"]).value as string
            ).match(ASSET_AMOUNT_REGEX)!

            const [, amountOut, denomOut] = (
              _.find(e.attributes, ["key", "tokens_out"]).value as string
            ).match(ASSET_AMOUNT_REGEX)!

            // truncate to every 2 hours
            let truncatedToTwoHour = dayjs
              .utc(tx.timestamp)
              .set("minute", 0)
              .set("second", 0)
              .set("millisecond", 0)
            truncatedToTwoHour = truncatedToTwoHour.set(
              "hour",
              _.floor(truncatedToTwoHour.hour() / 2) * 2
            )

            return {
              timestamp: truncatedToTwoHour,
              in: {
                amount: amountIn,
                denom: denomIn,
              },
              out: {
                amount: amountOut,
                denom: denomOut,
              },
            }
          })
          .value()
      )
      .groupBy("timestamp")
      .map((v, k) => {
        return {
          timestamp: k,
          count: v.length,
          in: _.chain(v)
            .groupBy("in.denom")
            .mapValues((v) =>
              _.reduce(
                v,
                (sum, { in: { amount } }) => sum.plus(amount),
                new BigNumber(0)
              ).toString()
            )
            .value(),
          out: _.chain(v)
            .groupBy("out.denom")
            .mapValues((v) =>
              _.reduce(
                v,
                (sum, { out: { amount } }) => sum.plus(amount),
                new BigNumber(0)
              ).toString()
            )
            .value(),
        }
      })
      .reverse()
      .value()

    return groupped
  },
  ["pool-in-out-assets"],
  {
    revalidate: 1800,
  }
)
