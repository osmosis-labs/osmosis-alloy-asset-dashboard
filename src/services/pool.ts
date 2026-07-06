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
import { fetchWithRetry } from "@/lib/utils"

import { getAssetMap, getAssetPrice } from "./asset"
import { getLimiters } from "./limiter"

const MIN_LIQUIDITY = 10
const BASE_POOLS_URL = `https://app.osmosis.zone/api/edge-trpc-pools/pools.getPools?input=%7B%22json%22%3A%7B%22limit%22%3A100%2C%22types%22%3A%5B%22cosmwasm%22%2C%22cosmwasm-transmuter%22%2C%22cosmwasm-alloyed%22%5D%2C%22minLiquidityUsd%22%3A${MIN_LIQUIDITY}%7D%7D`
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

  // A pool is a supported alloy iff its computed alloyed denom resolves to a
  // listed chain-registry asset. Do NOT also require more than one reserve
  // coin: the alloy-simplification programme has reduced many alloys (allSOL,
  // allLINK, allPEPE, ...) to a single remaining variant, and those are still
  // real, supported alloys. Assets with no chain-registry entry (ghost denoms
  // used only for transmuter plumbing, e.g. allSTARS / allDGN) fall through to
  // the unsupported branch here precisely because alloyAssetDetail is absent.
  if (!alloyAssetDetail) {
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
    fetchWithRetry(BASE_LIQUIDITY_CHART_URL.replace("{poolId}", pool.id))
      .then(async (d) => {
        if (!d.ok) {
          console.warn(
            `Failed to fetch liquidity chart: ${d.status} ${d.statusText}`
          )
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
        // The first element is the "now" snapshot with a sub-day timestamp;
        // drop it only when there is also at least one daily point to plot,
        // so a single-element response is not emptied out.
        (d.length > 1 ? d.slice(1) : d).map((v) => ({
          time: v.timestamp,
          value: v.liquidity_usd,
        }))
      )
      .catch((e) => {
        console.error(`Error fetching liquidity chart: ${e}`)
        return []
      }),
    fetchWithRetry(
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

// Pool types the dashboard is designed to surface. Used as the safety-net
// filter when the configured code-ID allowlist matches nothing (e.g. after a
// transmuter contract upgrade rolls out a code ID not yet added to the env).
const ALLOYED_POOL_TYPES = ["cosmwasm-alloyed", "cosmwasm-transmuter"]

export const getRawPoolsOverview = async () => {
  let response: Response
  try {
    response = await fetchWithRetry(BASE_POOLS_URL)
  } catch (e) {
    console.error(`Failed to fetch pools overview: ${e}`)
    return []
  }

  if (!response.ok) {
    console.error(
      `Failed to fetch pools overview: ${response.status} ${response.statusText}`
    )
    return []
  }

  try {
    const allPools = await response
      .json()
      .then((d) => d.result.data.json.items as RawPoolOverview[])

    const filtered = allPools.filter((pool) =>
      env.NEXT_PUBLIC_CODE_IDS.includes(pool.raw.code_id)
    )

    // Never blank out: if the configured code-ID allowlist matches nothing but
    // the endpoint did return alloyed/transmuter pools, the allowlist is stale
    // (a contract upgrade shipped a new code ID). Fall back to the full set of
    // alloyed/transmuter pools so the dashboard degrades to "shows extra pools"
    // rather than "shows nothing". The allowlist stays the preferred filter.
    if (filtered.length === 0) {
      const fallback = allPools.filter((pool) =>
        ALLOYED_POOL_TYPES.includes(pool.type)
      )
      if (fallback.length > 0) {
        console.warn(
          `[getRawPoolsOverview] Code-ID allowlist (${env.NEXT_PUBLIC_CODE_IDS.join(
            ","
          )}) matched 0 of ${allPools.length} returned pools; ` +
            `falling back to ${fallback.length} alloyed/transmuter pools. ` +
            `NEXT_PUBLIC_CODE_IDS is likely stale after a contract upgrade.`
        )
        return fallback
      }
    }

    return filtered
  } catch (e) {
    console.error(`Failed to parse pools overview JSON: ${e}`)
    return []
  }
}

type PoolsOverviewResult = {
  pools: PoolOverview[]
  unsupportedPools: NotSupportedPoolOverview[]
}

const EMPTY_POOLS_OVERVIEW: PoolsOverviewResult = {
  pools: [],
  unsupportedPools: [],
}

// Builds the overview from live upstream data. No caching here so the caller
// controls when a rebuild happens and can decide whether to accept the result.
const buildPoolsOverview = async (): Promise<PoolsOverviewResult> => {
  const data = await getRawPoolsOverview()
  const assetMap = await getAssetMap()

  // The asset map gates every supported/unsupported decision. If it is empty
  // (assetlist upstream failed), EVERY pool would be misclassified as
  // unsupported and that all-unsupported result would be cached. Treat an empty
  // map as a build failure so the caller serves the last-known-good snapshot
  // instead of caching a wrongly-empty Supported list. (getAssetMap normally
  // throws on assetlist failure; this guards the defensive path too.)
  if (_.isEmpty(assetMap)) {
    throw new Error("asset map is empty; refusing to build all-unsupported set")
  }

  const pools = await Promise.all(
    data.map((p) => fillPoolOverview(p, assetMap))
  )

  return {
    pools: pools.filter((p) => p.alloy.asset) as PoolOverview[],
    unsupportedPools: pools.filter(
      (p) => !p.alloy.asset
    ) as NotSupportedPoolOverview[],
  }
}

// Last-known-good tier. `unstable_cache` is backed by Next's data cache (not
// process memory), so it survives the serverless cold starts that made the
// previous module-variable approach a no-op.
//
// This tier holds the VALUE it last successfully built. It is SEEDED on the
// success path below (not lazily on the failure path): every healthy 30-minute
// cycle READS this function, so the very first healthy read after a deploy is a
// cache miss that builds from a confirmed-up upstream and caches the good
// value. Every later healthy read is a plain cache hit that returns the held
// value with no upstream call. The entry self-refreshes on its own 7-day
// revalidation. If a build (initial or a 7-day refresh) lands during an outage
// it THROWS rather than returning empty, and `unstable_cache` does not persist
// a thrown error, so the prior good value survives instead of being wiped.
//
// Reading (never revalidateTag) is deliberate: `revalidateTag` is unsupported
// inside an `unstable_cache` function, and a plain read already gives seed-once
// then serve-from-cache semantics, which is exactly last-known-good.
const getLastKnownGoodPools = unstable_cache(
  async (): Promise<PoolsOverviewResult> => {
    const fresh = await buildPoolsOverview()
    if (fresh.pools.length === 0) {
      // Do not let an empty build poison the long-lived entry.
      throw new Error("last-known-good rebuild produced no pools")
    }
    return fresh
  },
  ["pools-overview-last-good"],
  {
    revalidate: 604800, // 7 days
  }
)

export const getPoolsOverview = unstable_cache(
  async (): Promise<PoolsOverviewResult> => {
    let result: PoolsOverviewResult = EMPTY_POOLS_OVERVIEW
    try {
      result = await buildPoolsOverview()
    } catch (e) {
      console.error(`[getPoolsOverview] build failed: ${e}`)
    }

    // Fresh build succeeded: return it, but first READ the last-known-good tier
    // so it gets seeded while upstream is confirmed healthy. On the first
    // healthy cycle this is a cache miss that builds and stores the snapshot;
    // afterwards it is a cache hit (no upstream call). Seeding here, on the
    // success path, is what guarantees a good snapshot exists BEFORE an outage,
    // which was the gap in the previous fallback.
    if (result.pools.length > 0) {
      try {
        await getLastKnownGoodPools()
      } catch (e) {
        // Reseed build can fail; non-fatal. The fresh result still returns and
        // any previously cached good value stands.
        console.warn(`[getPoolsOverview] could not seed last-good: ${e}`)
      }
      return result
    }

    // Empty this cycle (upstream down or allowlist matched nothing): serve the
    // last-known-good snapshot so the dashboard does not blank out.
    console.warn(
      "[getPoolsOverview] No valid pools found, using last known good data"
    )
    try {
      const cached = await getLastKnownGoodPools()
      if (cached.pools.length > 0) {
        return cached
      }
    } catch (e) {
      // No good snapshot has ever been cached, or its scheduled rebuild failed.
      console.error(`[getPoolsOverview] no last-known-good available: ${e}`)
    }

    // Nothing live and nothing cached yet (only before the first successful
    // load). Return empty.
    return result
  },
  ["pools-overview"],
  {
    revalidate: 1800,
  }
)

export const getPoolOverview = async (poolId: string) => {
  const pools = await getPoolsOverview()
  return pools.pools.find((p) => p.id === poolId)
}

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
  // Determine the block height ~24h ago from the LCD's latest block.
  // (The previous AllesLabs GraphQL block-height lookup was removed: that host
  // no longer resolves. Osmosis produces ~72,000 blocks/day at ~1.2s each.)
  const BLOCKS_PER_DAY = 72000
  let height: number
  try {
    const heightResponse = await fetchWithRetry(
      "https://lcd.osmosis.zone/cosmos/base/tendermint/v1beta1/blocks/latest"
    )

    if (!heightResponse.ok) {
      throw new Error(`LCD endpoint returned ${heightResponse.status}`)
    }

    const heightData = await heightResponse.json()
    const currentHeight = Number(heightData.block.header.height)
    height = currentHeight - BLOCKS_PER_DAY
  } catch (fallbackError) {
    console.error(
      "Failed to fetch block height from LCD endpoint",
      fallbackError
    )
    throw new Error("Unable to determine block height: LCD endpoint failed")
  }

  try {
    const url = `https://lcd.osmosis.zone/cosmos/tx/v1beta1/txs?query=token_swapped.pool_id=${poolId}&query=tx.height>=${height}&order_by=2`
    const totalResponse = await fetchWithRetry(`${url}&limit=1`, {
      timeoutMs: 30000,
    })

    if (!totalResponse.ok) {
      console.error(
        `Failed to fetch tx count: ${totalResponse.status} ${totalResponse.statusText}`
      )
      return { total: 0, txs: [] }
    }

    const totalData = await totalResponse.json()
    const total = Number(totalData.total)

    const limit = 100
    const pages = Math.min(Math.ceil(total / limit), 10)
    const txs = await Promise.all(
      _.range(1, pages + 1).map(async (page) => {
        try {
          const response = await fetchWithRetry(
            `${url}&limit=${limit}&page=${page}`,
            { timeoutMs: 30000 }
          )
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
