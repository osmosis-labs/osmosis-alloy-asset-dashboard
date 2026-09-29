import { cache } from "react"
import { unstable_cache } from "next/cache"
import { MIGRATION_ALLOYS } from "@/constants/migration"
import BigNumber from "bignumber.js"
import _ from "lodash"

import { env } from "@/env.mjs"
import { AssetStatus, AssetWithDecimal, CurrencyAmount } from "@/types/asset"
import {
  NotSupportedPoolOverview,
  PoolInOutAssets,
  PoolKind,
  PoolOverview,
  RawPoolOverview,
} from "@/types/pool"
import { PoolSwap } from "@/types/tx"
import {
  ACTIVITY_MAX_SWAPS,
  ACTIVITY_RANGE_DAYS,
  PoolActivitySource,
} from "@/lib/activity"
import dayjs from "@/lib/dayjs"
import {
  appImageUrl,
  isMigrationPool,
  marketFiat,
  migrationAlloyAsset,
  parseReserveCoins,
} from "@/lib/pool-build"
import { reserveAmount } from "@/lib/pool-sources"
import { fetchLcd, fetchWithRetry, getAssetImageUrl } from "@/lib/utils"

import {
  getStoreCoverage,
  isStoreReady,
  readFlowPoints,
  readSwaps,
} from "./activity-store"
import {
  getAssetMap,
  getAssetPrice,
  getAssetStatusMapSafe,
  getFrontendAssetNamesSafe,
  getFrontendAssetSymbolsSafe,
} from "./asset"
import lastKnownGoodPoolsSnapshot from "./last-known-good-pools.json"
import { getLimiters } from "./limiter"
import { getVariantProvenanceSafe, Provenance } from "./provenance"
import {
  bucketFlows,
  flowPointsFromSwaps,
  SwapEvent,
  swapEventsFromTx,
} from "./swap-rows"
import { getPoolContractStatus, getTotalPoolLiquidity } from "./transmuter"

const MIN_LIQUIDITY = 10
// Alloys with less than this much value locked are treated as unsupported
// (surfaced in the Not Supported table, not hidden). Migration alloys are
// exempt: they are listed for as long as the migration runs.
const MIN_SUPPORTED_TVL_USD = 10_000
const BASE_POOLS_URL = `https://app.osmosis.zone/api/edge-trpc-pools/pools.getPools?input=%7B%22json%22%3A%7B%22limit%22%3A100%2C%22types%22%3A%5B%22cosmwasm%22%2C%22cosmwasm-transmuter%22%2C%22cosmwasm-alloyed%22%5D%2C%22minLiquidityUsd%22%3A${MIN_LIQUIDITY}%7D%7D`
const BASE_LIQUIDITY_CHART_URL =
  "https://public-osmosis-api.numia.xyz/pools/liquidity/{poolId}/over_time"
// The same SQS deployment the Osmosis frontend reads.
const BASE_PRICE_URL =
  "https://sqsprod.osmosis.zone/tokens/prices?base={denoms}"
const BASE_SQS_POOLS_URL = "https://sqsprod.osmosis.zone/pools?IDs={ids}"
// Same LCD the contract queries use (src/services/transmuter.ts).
const BASE_POOLMANAGER_POOL_URL =
  "https://osmosis-rest.publicnode.com/osmosis/poolmanager/v1beta1/pools/{poolId}"
// Numia returns the liquidity series newest-first: element 0 is a live "now"
// snapshot with a sub-day timestamp, followed by one point per UTC day. The
// "now" point duplicates the head of the daily series, so it is normally
// dropped. When Numia's daily aggregation stalls (as it did from 2026-08-26),
// that snapshot is the ONLY current data point and dropping it freezes the
// chart on the last aggregated day. Keep it once the gap exceeds this many
// hours so the chart still runs to the present during an upstream stall.
const LIVE_SNAPSHOT_KEEP_AFTER_HOURS = 36

type RawLiquidityPoint = { timestamp: string; liquidity_usd: number }

// Decides whether to keep Numia's leading "now" snapshot (see
// LIVE_SNAPSHOT_KEEP_AFTER_HOURS). Healthy upstream: the snapshot sits within
// hours of the newest daily point and is dropped as a duplicate. Stalled
// upstream: it is days ahead, so it is kept and the chart reaches the present
// instead of flatlining on the last aggregated day. No data is invented; this
// only chooses whether to discard a point Numia already returned.
const dropRedundantLiveSnapshot = (
  points: RawLiquidityPoint[]
): RawLiquidityPoint[] => {
  // A single point is all there is to plot: never empty it out.
  if (points.length <= 1) return points

  const [live, ...daily] = points
  const liveAt = dayjs.utc(live?.timestamp)
  const latestDailyAt = dayjs.utc(daily[0]?.timestamp)

  // Unparseable timestamps: fall back to the historical drop-the-head
  // behaviour rather than risk plotting a bogus point.
  if (!liveAt.isValid() || !latestDailyAt.isValid()) return daily

  const gapHours = liveAt.diff(latestDailyAt, "hour")

  return gapHours > LIVE_SNAPSHOT_KEEP_AFTER_HOURS ? points : daily
}

// Variants carry the frontend's display name ("USDC (Noble)"); the
// chain-registry name is only the fallback. Only reserve coins are renamed:
// the alloy keeps its registry name.
// Variants ordered from most to least prevalent in the pool. The variants of
// one alloy share a unit, so display amounts compare directly.
const byPrevalence = <T extends { currency: CurrencyAmount }>(coins: T[]) =>
  _.sortBy(coins, (c) => -reserveAmount(c.currency))

const withFrontendName = (
  asset: AssetWithDecimal | undefined,
  frontendName: string | undefined
) => (asset && frontendName ? { ...asset, name: frontendName } : asset)

const fillPoolOverview = async (
  pool: RawPoolOverview,
  assetMap?: _.Dictionary<AssetWithDecimal>,
  statusMap: Record<string, AssetStatus> = {},
  frontendNames: Record<string, string> = {},
  provenance: Record<string, Provenance> = {}
) => {
  if (!assetMap) {
    assetMap = await getAssetMap()
  }

  const alloyDenom = calculdateAlloyAssetDenom(
    pool.raw.contract_address,
    pool.raw.instantiate_msg
  )

  const migration = MIGRATION_ALLOYS[pool.id]
  const kind: PoolKind = migration ? "migration" : "alloy"
  const alloyAssetDetail = migration
    ? migrationAlloyAsset(pool, alloyDenom, migration, assetMap)
    : assetMap[alloyDenom]

  const reserveCoins = byPrevalence(
    parseReserveCoins(pool).map((c) => ({
      asset: withFrontendName(
        assetMap[c.currency.coinMinimalDenom],
        frontendNames[c.currency.coinMinimalDenom]
      ),
      provenance: provenance[c.currency.coinMinimalDenom] ?? null,
      currency: {
        ...c,
        currency: {
          ...c.currency,
          coinImageUrl: appImageUrl(c.currency.coinImageUrl),
        },
      } as CurrencyAmount,
    }))
  )
  const market = {
    spreadFactor: JSON.parse(pool.spreadFactor),
    totalFiatValueLocked: JSON.parse(pool.totalFiatValueLocked),
    poolNameByDenom: pool.poolNameByDenom,
    coinNames: pool.coinNames,
    volume24hUsd: marketFiat(pool.market?.volume24hUsd),
    volume7dUsd: marketFiat(pool.market?.volume7dUsd),
    feesSpent24hUsd: marketFiat(pool.market?.feesSpent24hUsd),
    feesSpent7dUsd: marketFiat(pool.market?.feesSpent7dUsd),
  }

  // A pool is a supported alloy iff its computed alloyed denom resolves to a
  // listed chain-registry asset (or it is a configured migration alloy, see
  // src/constants/migration.ts). Other assets with no chain-registry entry
  // fall through to the unsupported branch because alloyAssetDetail is absent.
  // Single-variant alloys (allSOL, allLINK, ...) are supported like any other.
  //
  // Further demotions to the unsupported table:
  //   1. Dust alloys: less than MIN_SUPPORTED_TVL_USD of value locked
  //      (migration alloys are exempt).
  //   2. Any variant without decimals: its amounts cannot be shown.
  const tvlUsd = Number(market.totalFiatValueLocked.amount)
  const isBelowMinTvl =
    !migration && Number.isFinite(tvlUsd) && tvlUsd < MIN_SUPPORTED_TVL_USD
  const hasUnknownDecimals = reserveCoins.some(
    (c) => typeof c.currency.currency.coinDecimals !== "number"
  )

  if (!alloyAssetDetail || isBelowMinTvl || hasUnknownDecimals) {
    return {
      id: pool.id,
      type: pool.type,
      codeId: pool.raw.code_id,
      contractAddress: pool.raw.contract_address,
      reserveCoins,
      ...market,
      prices: {},
      liquidityChart: [],
      assets: null,
      alloy: {
        asset: null,
        price: null,
      },
      limiters: null,
      status: null,
    } as NotSupportedPoolOverview
  }

  const reserveDenoms = reserveCoins.map(
    (c) => c.currency.currency.coinMinimalDenom
  )

  const [liquidityChart, prices, limiters, contractStatus] = await Promise.all([
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
        dropRedundantLiveSnapshot(d).map((v) => ({
          time: v.timestamp,
          value: v.liquidity_usd,
        }))
      )
      .catch((e) => {
        console.error(`Error fetching liquidity chart: ${e}`)
        return []
      }),
    fetchWithRetry(BASE_PRICE_URL.replace("{denoms}", reserveDenoms.join(",")))
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
      // SQS quotes each price in one stablecoin (allUSDC), taken as USD.
      .then((d) =>
        _.chain(d)
          .mapValues((v) => Number(_.values(v)[0]))
          .pickBy((v) => Number.isFinite(v) && v > 0)
          .value()
      )
      .catch((e) => {
        console.error(`Error fetching prices: ${e}`)
        return {}
      }),
    getLimiters(pool.raw.contract_address),
    getPoolContractStatus(pool.raw.contract_address),
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
    kind,
    type: pool.type,
    codeId: pool.raw.code_id,
    contractAddress: pool.raw.contract_address,
    reserveCoins,
    ...market,
    liquidityChart,
    prices,
    alloy: {
      asset: alloyAssetDetail,
      price: alloyAssetPrice,
    },
    limiters,
    status: {
      ...contractStatus,
      alloy: statusMap[alloyDenom] ?? null,
      reserves: _.pick(statusMap, reserveDenoms),
    },
  } as PoolOverview
}

// Migration pools the pools API leaves out (it drops pools it cannot price,
// such as allMARS), built from chain data instead: the pool from the pool
// manager, its reserves from the contract, symbols and names from the
// frontend assetlist, decimals and images from the chain-registry list, and
// its value from SQS. There is no market data, so volumes stay unknown. A
// pool any of these fail for is left out of this build.
const getMigrationRawPools = async (
  poolIds: string[],
  assetMap: _.Dictionary<AssetWithDecimal>,
  symbols: Record<string, string>,
  names: Record<string, string>
): Promise<RawPoolOverview[]> => {
  if (poolIds.length === 0) return []
  let caps: Record<string, string> = {}
  try {
    const res = await fetchWithRetry(
      BASE_SQS_POOLS_URL.replace("{ids}", poolIds.join(","))
    )
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
    const data = (await res.json()) as {
      chain_model?: { pool_id?: number | string }
      liquidity_cap?: string
    }[]
    caps = _.fromPairs(
      data.flatMap((p) =>
        p.chain_model?.pool_id !== undefined && p.liquidity_cap !== undefined
          ? [[String(p.chain_model.pool_id), p.liquidity_cap]]
          : []
      )
    )
  } catch (e) {
    console.error(`[getMigrationRawPools] SQS pools unavailable: ${e}`)
    return []
  }

  const pools = await Promise.all(
    poolIds.map(async (poolId): Promise<RawPoolOverview | null> => {
      try {
        const res = await fetchWithRetry(
          BASE_POOLMANAGER_POOL_URL.replace("{poolId}", poolId)
        )
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
        const { pool } = (await res.json()) as {
          pool: {
            contract_address: string
            code_id: string
            pool_id: string
            instantiate_msg: string
          }
        }
        const liquidity = await getTotalPoolLiquidity(pool.contract_address)
        const cap = caps[poolId]
        if (!liquidity || cap === undefined) {
          throw new Error("reserves or value unavailable")
        }
        const reserveCoins = liquidity.map(({ denom, amount }) => {
          const asset = assetMap[denom]
          if (!asset) throw new Error(`no assetlist entry for ${denom}`)
          return JSON.stringify({
            currency: {
              coinDenom: symbols[denom] ?? asset.symbol,
              coinName: names[denom] ?? asset.name,
              coinMinimalDenom: denom,
              coinDecimals: asset.decimal,
              coinImageUrl: getAssetImageUrl(asset) ?? "",
            },
            amount,
          })
        })
        return {
          id: poolId,
          type: "cosmwasm",
          raw: {
            contract_address: pool.contract_address,
            code_id: pool.code_id,
            pool_id: pool.pool_id,
            instantiate_msg: pool.instantiate_msg,
          },
          reserveCoins,
          spreadFactor: JSON.stringify({ rate: "0" }),
          totalFiatValueLocked: JSON.stringify({
            fiat: { currency: "usd", symbol: "$", maxDecimals: 2 },
            amount: cap,
          }),
          poolNameByDenom: "",
          coinNames: [],
        }
      } catch (e) {
        console.error(`[getMigrationRawPools] pool ${poolId}: ${e}`)
        return null
      }
    })
  )
  return _.compact(pools)
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

// `pools` holds both kinds of supported pool (see PoolOverview.kind): the
// overview shows the alloys, /pools lists the migration alloys apart.
// `source` says which tier this came from (see resolvePoolsOverview) and
// `builtAt` when its data was fetched, so pages can say when they are showing
// old data. Both are absent on entries cached before they existed.
export type PoolsOverviewResult = {
  pools: PoolOverview[]
  unsupportedPools: NotSupportedPoolOverview[]
  source?: "live" | "runtime" | "snapshot"
  builtAt?: string
}

const EMPTY_POOLS_OVERVIEW: PoolsOverviewResult = {
  pools: [],
  unsupportedPools: [],
}

export { isMigrationPool }

// A usable overview has at least one alloy. Migration pools alone do not
// count: getMigrationRawPools can still build them while the pools API is
// down, and caching that as a healthy result would blank the overview.
const hasAlloys = (result: PoolsOverviewResult) =>
  result.pools.some((p) => !isMigrationPool(p))

// Builds the overview from live upstream data. No caching here so the caller
// controls when a rebuild happens and can decide whether to accept the result.
const buildPoolsOverview = async (): Promise<PoolsOverviewResult> => {
  const [data, assetMap, statusMap, frontendNames, frontendSymbols] =
    await Promise.all([
      getRawPoolsOverview(),
      getAssetMap(),
      getAssetStatusMapSafe(),
      getFrontendAssetNamesSafe(),
      getFrontendAssetSymbolsSafe(),
    ])

  // The asset map gates every supported/unsupported decision. If it is empty
  // (assetlist upstream failed), EVERY pool would be misclassified as
  // unsupported and that all-unsupported result would be cached. Treat an empty
  // map as a build failure so the caller serves the last-known-good snapshot
  // instead of caching a wrongly-empty Supported list. (getAssetMap normally
  // throws on assetlist failure; this guards the defensive path too.)
  if (_.isEmpty(assetMap)) {
    throw new Error("asset map is empty; refusing to build all-unsupported set")
  }

  const listed = new Set(data.map((p) => p.id))
  const supplemented = await getMigrationRawPools(
    Object.keys(MIGRATION_ALLOYS).filter((id) => !listed.has(id)),
    assetMap,
    frontendSymbols,
    frontendNames
  )
  const rawPools = [...data, ...supplemented]

  const provenance = await getVariantProvenanceSafe(
    rawPools.flatMap((p) =>
      p.reserveCoins.map(
        (coin) => JSON.parse(coin).currency.coinMinimalDenom as string
      )
    )
  )

  const pools = await Promise.all(
    rawPools.map((p) =>
      fillPoolOverview(p, assetMap, statusMap, frontendNames, provenance)
    )
  )

  return {
    pools: pools.filter((p) => p.alloy.asset) as PoolOverview[],
    unsupportedPools: pools.filter(
      (p) => !p.alloy.asset
    ) as NotSupportedPoolOverview[],
    source: "live",
    builtAt: new Date().toISOString(),
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
//
// Cache keys carry a version: the Vercel data cache is shared across
// deployments, and entries from before migration kinds, nullable volumes and
// the $10k cutoff must not be read.
const getLastKnownGoodPools = unstable_cache(
  async (): Promise<PoolsOverviewResult> => {
    const fresh = await buildPoolsOverview()
    if (!hasAlloys(fresh)) {
      // Do not let an empty build poison the long-lived entry.
      throw new Error("last-known-good rebuild produced no pools")
    }
    return fresh
  },
  ["pools-overview-last-good-v2"],
  {
    revalidate: 604800, // 7 days
  }
)

// Committed, durable last-known-good tier. This is shipped in the repo (see
// scripts/generate-last-known-good.mjs) so that even the FIRST cold build after
// a fresh deploy has a non-empty result to fall back to. The runtime
// `getLastKnownGoodPools` tier above only ever holds a value AFTER a healthy
// build has seeded it, so it provides no protection for the one case that
// blanked the dashboard: the first cold build failing on a fresh deploy (a new
// deploy starts with an empty Next data cache). This static snapshot closes
// that gap. It is deliberately the LAST resort: live data and the runtime
// last-known-good value are always preferred when available.
// Double cast: the JSON module's structurally-inferred type (e.g. `type:
// string`) does not overlap the union-typed PoolsOverviewResult, and this is
// static generated data, so a widening assertion is the intended path. The
// snapshot's shape is validated by the generator, which mirrors
// fillPoolOverview field-for-field.
const COMMITTED_SNAPSHOT =
  lastKnownGoodPoolsSnapshot as unknown as PoolsOverviewResult

// Resolves the best available overview WITHOUT caching, walking the fallback
// tiers in preference order:
//   1. Live build from current upstream data.
//   2. Runtime last-known-good (a value a previous healthy build seeded).
//   3. Committed snapshot shipped in the repo (always non-empty).
// Returns EMPTY_POOLS_OVERVIEW only in the impossible case that all three fail,
// which the caller treats as a hard error so an empty set is never cached.
const resolvePoolsOverview = async (): Promise<PoolsOverviewResult> => {
  let result: PoolsOverviewResult = EMPTY_POOLS_OVERVIEW
  try {
    result = await buildPoolsOverview()
  } catch (e) {
    console.error(`[getPoolsOverview] build failed: ${e}`)
  }

  // Fresh build succeeded: return it, but first READ the runtime last-known-good
  // tier so it gets seeded while upstream is confirmed healthy. On the first
  // healthy cycle this is a cache miss that builds and stores the snapshot;
  // afterwards it is a cache hit (no upstream call).
  if (hasAlloys(result)) {
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
  // runtime last-known-good snapshot so the dashboard does not blank out.
  console.warn(
    "[getPoolsOverview] No valid pools found, trying runtime last known good"
  )
  try {
    const cached = await getLastKnownGoodPools()
    if (hasAlloys(cached)) {
      return { ...cached, source: "runtime" }
    }
  } catch (e) {
    // No good snapshot has ever been cached, or its scheduled rebuild failed.
    console.error(
      `[getPoolsOverview] no runtime last-known-good available: ${e}`
    )
  }

  // Runtime tiers both empty (e.g. first cold build after a deploy failing).
  // Fall back to the committed snapshot shipped in the repo.
  if (hasAlloys(COMMITTED_SNAPSHOT)) {
    console.warn(
      "[getPoolsOverview] Falling back to committed last-known-good snapshot"
    )
    return { ...COMMITTED_SNAPSHOT, source: "snapshot" }
  }

  return result
}

export const getPoolsOverview = unstable_cache(
  async (): Promise<PoolsOverviewResult> => {
    const result = await resolvePoolsOverview()

    // Never cache an empty result. `unstable_cache` persists RETURNED values but
    // NOT thrown errors, so returning EMPTY here would lock a blank dashboard in
    // for the full `revalidate` window (the original blank-out bug). Throwing
    // instead means a transient all-tiers-empty state is retried on the next
    // request rather than cached. With the committed snapshot always present
    // this branch is effectively unreachable, but the guard is the invariant
    // that keeps an empty set from ever being served from cache.
    if (!hasAlloys(result)) {
      throw new Error(
        "[getPoolsOverview] all tiers produced no pools; refusing to cache empty"
      )
    }

    return result
  },
  ["pools-overview-v2"],
  {
    revalidate: 1800,
  }
)

// Any supported pool, alloy or migration alloy.
export const getPoolOverview = async (poolId: string) => {
  const pools = await getPoolsOverview()
  return pools.pools.find((p) => p.id === poolId)
}

const calculdateAlloyAssetDenom = (
  contractAddress: string,
  instantiateMsg: string
) => {
  const base64 = atob(instantiateMsg)
  const decoded = JSON.parse(base64)
  return `factory/${contractAddress}/alloyed/${decoded.alloyed_asset_subdenom}`
}

export { ACTIVITY_MAX_SWAPS }

export const getPoolInOutTxs = cache(async (poolId: string) => {
  // Determine the block height ~24h ago from the LCD's latest block.
  // (The previous AllesLabs GraphQL block-height lookup was removed: that host
  // no longer resolves. Osmosis produces ~72,000 blocks/day at ~1.2s each.)
  const BLOCKS_PER_DAY = 72000
  let height: number
  try {
    const heightResponse = await fetchLcd(
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
    // One `query` with AND. With two separate `query` params the LCD applies
    // only one of them, so the height window was silently dropped: the count
    // covered the pool's whole history and a frozen pool showed pre-freeze
    // swaps as recent activity.
    const query = encodeURIComponent(
      `token_swapped.pool_id=${poolId} AND tx.height>=${height}`
    )
    const url = `https://lcd.osmosis.zone/cosmos/tx/v1beta1/txs?query=${query}&order_by=2`
    const totalResponse = await fetchLcd(`${url}&limit=1`, {
      timeoutMs: 30000,
    })

    // Throw rather than return empty: getPoolInOutAssets is wrapped in
    // unstable_cache, which persists returned values but not thrown errors, so
    // an empty result from a rate-limited or banned IP would be served as "no
    // activity" for the whole revalidate window.
    if (!totalResponse.ok) {
      throw new Error(
        `Failed to fetch tx count: ${totalResponse.status} ${totalResponse.statusText}`
      )
    }

    const totalData = await totalResponse.json()
    const total = Number(totalData.total)

    const limit = 100
    const pages = Math.min(Math.ceil(total / limit), ACTIVITY_MAX_SWAPS / limit)
    const txs = await Promise.all(
      _.range(1, pages + 1).map(async (page) => {
        try {
          const response = await fetchLcd(
            `${url}&limit=${limit}&page=${page}`,
            { timeoutMs: 30000 }
          )
          if (!response.ok) {
            console.warn(`Failed to fetch tx page ${page}: ${response.status}`)
            return null
          }
          const data = await response.json()
          return (data.tx_responses ?? []) as any[]
        } catch (e) {
          console.warn(`Error fetching tx page ${page}: ${e}`)
          return null
        }
      })
    )

    // Partial pages still plot; every page failing is an outage, not "no
    // activity", so it must not be cached (see the tx count above).
    if (pages > 0 && txs.every((t) => t === null)) {
      throw new Error(`All ${pages} tx pages failed for pool ${poolId}`)
    }

    return {
      total,
      txs: txs.flatMap((t) => t ?? []),
    }
  } catch (e) {
    console.error(e)
    throw e
  }
})

// Activity for a date range, and where it came from: "store" is the Postgres
// activity store (used once it is fresh and covers at least the last 24h; a
// longer range returns what has been collected, from `coveredFrom`), "live"
// the LCD fallback (latest ACTIVITY_MAX_SWAPS swaps only, whatever the range).
const DAY_MS = 24 * 60 * 60 * 1000
export type PoolActivity = {
  source: PoolActivitySource
  activities: PoolInOutAssets[]
  coveredFrom?: string
}

// The live LCD fallback has its own 30-minute cache, so the store reads below
// do not multiply LCD load (and fail2ban risk) while the store is unavailable.
// Store reads refresh at the cron's cadence: the store only changes every 15
// minutes, and each read is billed.
const LIVE_REVALIDATE_SECONDS = 1800
const STORE_REVALIDATE_SECONDS = 900

const getLiveActivity = unstable_cache(
  async (poolId: string): Promise<PoolActivity> => {
    const { txs } = await getPoolInOutTxs(poolId)
    const swaps = _.flatMap(txs, (tx) => swapEventsFromTx(tx, poolId))
    return {
      source: "live",
      activities: bucketFlows(flowPointsFromSwaps(swaps)),
    }
  },
  ["pool-activity-live-v1"],
  { revalidate: LIVE_REVALIDATE_SECONDS }
)

// Cache key bumped with the return shape and the range argument: the Vercel
// data cache is shared across deployments, and an old-shape entry must not be
// read here. Store reads are cheap, so this refreshes every 5 minutes.
export const getPoolInOutAssets = unstable_cache(
  async (poolId: string, range: string = "24h"): Promise<PoolActivity> => {
    const coverage = await getStoreCoverage(poolId)
    if (coverage && coverage.coveredFrom.getTime() <= Date.now() - DAY_MS) {
      try {
        // null means "all" (from coveredFrom); `??` would turn it into 1 day.
        const days =
          range in ACTIVITY_RANGE_DAYS ? ACTIVITY_RANGE_DAYS[range] : 1
        const requested =
          days === null
            ? coverage.coveredFrom.getTime()
            : Date.now() - days * DAY_MS
        const from = Math.max(requested, coverage.coveredFrom.getTime())
        const points = await readFlowPoints(poolId, new Date(from))
        return {
          source: "store",
          activities: bucketFlows(points, {
            minBucketMinutes: 15,
            from,
            to: Date.now(),
          }),
          coveredFrom: coverage.coveredFrom.toISOString(),
        }
      } catch (e) {
        console.error(`[getPoolInOutAssets] store read failed: ${e}`)
      }
    }

    return getLiveActivity(poolId)
  },
  ["pool-in-out-assets-v3"],
  { revalidate: STORE_REVALIDATE_SECONDS }
)

const toPoolSwap = ({ msgIndex, eventIndex, ...swap }: SwapEvent): PoolSwap =>
  swap

// Live fallback rows, from the same LCD fetch as the live activity (React
// cache() dedupes it within a render). The raw tx pages (~3MB each) are too
// large for the data cache, so the compact rows are cached instead, on the
// live 30-minute schedule.
const getLiveSwaps = unstable_cache(
  async (poolId: string): Promise<PoolSwap[]> => {
    const { txs } = await getPoolInOutTxs(poolId)
    return _.flatMap(txs, (tx) => swapEventsFromTx(tx, poolId)).map(toPoolSwap)
  },
  ["pool-swaps-live-v1"],
  { revalidate: LIVE_REVALIDATE_SECONDS }
)

// Swap rows for the pool's transaction table: from the activity store when it
// is fresh (refreshed every 5 minutes), otherwise the live fallback.
export const getPoolSwaps = unstable_cache(
  async (poolId: string): Promise<PoolSwap[]> => {
    const windowStart = new Date(Date.now() - DAY_MS)
    if (await isStoreReady(poolId, windowStart)) {
      try {
        return await readSwaps(poolId, ACTIVITY_MAX_SWAPS)
      } catch (e) {
        console.error(`[getPoolSwaps] store read failed: ${e}`)
      }
    }
    return getLiveSwaps(poolId)
  },
  ["pool-swaps"],
  { revalidate: STORE_REVALIDATE_SECONDS }
)
