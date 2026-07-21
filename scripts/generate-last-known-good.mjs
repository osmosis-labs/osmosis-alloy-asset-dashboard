// Regenerates src/services/last-known-good-pools.json — the durable, committed
// fallback that src/services/pool.ts serves when a live build fails AND the
// runtime last-known-good cache is cold (the first cold build after a fresh
// deploy). Without a committed snapshot the dashboard blanks out for a full
// revalidate window in that case.
//
// This script fetches the SAME upstreams and applies the SAME transforms as
// buildPoolsOverview / fillPoolOverview in src/services/pool.ts. Keep the two in
// sync: if the shape produced by fillPoolOverview changes, update this script
// and re-run it. It is intentionally dependency-free (plain Node fetch) so it
// can run without the Next runtime, and produces output shaped exactly like a
// PoolsOverviewResult ({ pools, unsupportedPools }).
//
// Usage:  node scripts/generate-last-known-good.mjs
//
// It writes the JSON next to the service that consumes it and prints a summary.

import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_PATH = join(
  __dirname,
  "..",
  "src",
  "services",
  "last-known-good-pools.json"
)

// --- Mirror of the constants in src/services/pool.ts ---
const MIN_LIQUIDITY = 10
const MIN_SUPPORTED_TVL_USD = 1000
const WRAPPER_RESERVE_DECIMALS = 18
const BASE_POOLS_URL = `https://app.osmosis.zone/api/edge-trpc-pools/pools.getPools?input=%7B%22json%22%3A%7B%22limit%22%3A100%2C%22types%22%3A%5B%22cosmwasm%22%2C%22cosmwasm-transmuter%22%2C%22cosmwasm-alloyed%22%5D%2C%22minLiquidityUsd%22%3A${MIN_LIQUIDITY}%7D%7D`
const BASE_ASSET_URL = "https://app.osmosis.zone"
const BASE_LIQUIDITY_CHART_URL =
  "https://public-osmosis-api.numia.xyz/pools/liquidity/{poolId}/over_time"
const BASE_PRICE_URL = "https://sqs.osmosis.zone/tokens/prices?base={denoms}"
const BASE_ASSET_LIST =
  "https://raw.githubusercontent.com/osmosis-labs/assetlists/main/osmosis-1/generated/chain_registry/assetlist.json"
const BASE_ASSET_PRICE =
  "https://app.osmosis.zone/api/edge-trpc-assets/assets.getAssetPrice?input=%7B%22json%22:%7B%22coinMinimalDenom%22:%22{denom}%22%7D%7D"

const ZERO_FIAT = {
  fiat: { currency: "usd", symbol: "$", maxDecimals: 2, locale: "en-US" },
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

const FIAT_OPTS = ZERO_FIAT.options

const fetchJson = async (url, { timeoutMs = 20000 } = {}) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (alloy-dashboard-snapshot)" },
    })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`)
    return await res.json()
  } finally {
    clearTimeout(timer)
  }
}

// Mirror of fetchAssetList in src/services/asset.ts.
const getAssets = async () => {
  const data = await fetchJson(BASE_ASSET_LIST)
  const assets = data.assets
  if (!Array.isArray(assets) || assets.length === 0) {
    throw new Error("Asset list fetch returned no assets")
  }
  return assets.map((a) => ({
    ...a,
    denom: a.denom_units[0].denom,
    decimal: a.denom_units[a.denom_units.length - 1].exponent || 6,
  }))
}

// Mirror of calculdateAlloyAssetDenom in src/services/pool.ts.
const calcAlloyDenom = (contractAddress, instantiateMsg) => {
  const decoded = JSON.parse(Buffer.from(instantiateMsg, "base64").toString())
  return `factory/${contractAddress}/alloyed/${decoded.alloyed_asset_subdenom}`
}

// Mirror of getLimiters in src/services/limiter.ts (list_limiters smart query).
const getLimiters = async (contractAddress) => {
  try {
    const res = await fetch(
      `https://osmosis-rest.publicnode.com/cosmwasm/wasm/v1/contract/${contractAddress}/smart/ewogICJsaXN0X2xpbWl0ZXJzIjoge30KfQ==`
    )
    if (!res.ok) return {}
    const response = await res.json()
    const limiters = response.data.limiters
    const out = {}
    for (const [[k], v] of limiters) {
      if ("static_limiter" in v)
        out[k] = { type: "static", ...v.static_limiter }
      else if ("change_limiter" in v)
        out[k] = { type: "change", ...v.change_limiter }
    }
    return out
  } catch {
    return {}
  }
}

// Mirror of getAssetPrice in src/services/asset.ts.
const getAssetPrice = async (denom) => {
  try {
    const res = await fetch(BASE_ASSET_PRICE.replace("{denom}", denom))
    if (!res.ok) return null
    const data = await res.json().then((d) => d.result.data.json)
    return JSON.parse(data)
  } catch {
    return null
  }
}

// Mirror of the liquidity-chart fetch + shaping in fillPoolOverview.
const getLiquidityChart = async (poolId) => {
  try {
    const res = await fetch(
      BASE_LIQUIDITY_CHART_URL.replace("{poolId}", poolId)
    )
    if (!res.ok) return []
    const d = await res.json()
    if (!Array.isArray(d)) return []
    return (d.length > 1 ? d.slice(1) : d).map((v) => ({
      time: v.timestamp,
      value: v.liquidity_usd,
    }))
  } catch {
    return []
  }
}

// Mirror of the prices fetch + shaping in fillPoolOverview.
const getPrices = async (denoms) => {
  try {
    const res = await fetch(
      BASE_PRICE_URL.replace("{denoms}", denoms.join(","))
    )
    if (!res.ok) return {}
    const d = await res.json()
    const out = {}
    for (const [k, v] of Object.entries(d)) out[k] = Object.values(v)[0]
    return out
  } catch {
    return {}
  }
}

const mean = (arr) => {
  const nums = arr.filter((n) => typeof n === "number" && !Number.isNaN(n))
  if (nums.length === 0) return undefined
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

const mapReserveCoins = (pool, assetMap) =>
  pool.reserveCoins.map((coin) => {
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
  })

const market = (pool) => ({
  volume24hUsd: pool.market?.volume24hUsd
    ? JSON.parse(pool.market.volume24hUsd)
    : ZERO_FIAT,
  volume7dUsd: pool.market?.volume7dUsd
    ? JSON.parse(pool.market.volume7dUsd)
    : ZERO_FIAT,
  feesSpent24hUsd: pool.market?.feesSpent24hUsd
    ? JSON.parse(pool.market.feesSpent24hUsd)
    : ZERO_FIAT,
  feesSpent7dUsd: pool.market?.feesSpent7dUsd
    ? JSON.parse(pool.market.feesSpent7dUsd)
    : ZERO_FIAT,
})

// Mirror of fillPoolOverview in src/services/pool.ts.
const fillPoolOverview = async (pool, assetMap) => {
  const alloyDenom = calcAlloyDenom(
    pool.raw.contract_address,
    pool.raw.instantiate_msg
  )
  const alloyAssetDetail = assetMap[alloyDenom]

  const reserveDecimals = pool.reserveCoins.map(
    (coin) => JSON.parse(coin).currency.coinDecimals
  )
  const isSingleAssetWrapper =
    !!alloyAssetDetail &&
    reserveDecimals.length === 1 &&
    reserveDecimals[0] === WRAPPER_RESERVE_DECIMALS &&
    alloyAssetDetail.decimal < WRAPPER_RESERVE_DECIMALS

  const tvlUsd = Number(JSON.parse(pool.totalFiatValueLocked).amount)
  const isBelowMinTvl =
    Number.isFinite(tvlUsd) && tvlUsd < MIN_SUPPORTED_TVL_USD

  if (!alloyAssetDetail || isSingleAssetWrapper || isBelowMinTvl) {
    return {
      id: pool.id,
      type: pool.type,
      codeId: pool.raw.code_id,
      contractAddress: pool.raw.contract_address,
      reserveCoins: mapReserveCoins(pool, assetMap),
      spreadFactor: JSON.parse(pool.spreadFactor),
      totalFiatValueLocked: JSON.parse(pool.totalFiatValueLocked),
      poolNameByDenom: pool.poolNameByDenom,
      coinNames: pool.coinNames,
      ...market(pool),
      prices: {},
      liquidityChart: [],
      assets: null,
      alloy: { asset: null, price: null },
      limiters: null,
    }
  }

  const [liquidityChart, prices, limiters] = await Promise.all([
    getLiquidityChart(pool.id),
    getPrices(
      pool.reserveCoins.map(
        (coin) => JSON.parse(coin).currency.coinMinimalDenom
      )
    ),
    getLimiters(pool.raw.contract_address),
  ])

  let alloyAssetPrice = await getAssetPrice(alloyDenom)
  if (alloyAssetPrice && Number(alloyAssetPrice.amount) > 1000000)
    alloyAssetPrice = null
  if (!alloyAssetPrice) {
    const foundAssetPrice = mean(Object.values(prices))
    if (foundAssetPrice) {
      alloyAssetPrice = {
        fiat: { currency: "usd", symbol: "$", maxDecimals: 2, locale: "en-US" },
        options: FIAT_OPTS,
        amount: String(foundAssetPrice),
      }
    }
  }

  return {
    id: pool.id,
    type: pool.type,
    codeId: pool.raw.code_id,
    contractAddress: pool.raw.contract_address,
    reserveCoins: mapReserveCoins(pool, assetMap),
    spreadFactor: JSON.parse(pool.spreadFactor),
    totalFiatValueLocked: JSON.parse(pool.totalFiatValueLocked),
    poolNameByDenom: pool.poolNameByDenom,
    coinNames: pool.coinNames,
    ...market(pool),
    liquidityChart,
    prices,
    alloy: { asset: alloyAssetDetail, price: alloyAssetPrice },
    limiters,
  }
}

const main = async () => {
  console.log("Fetching pools + assetlist ...")
  const [poolsResponse, assets] = await Promise.all([
    fetchJson(BASE_POOLS_URL),
    getAssets(),
  ])
  const allPools = poolsResponse.result.data.json.items
  const assetMap = Object.fromEntries(
    assets.filter((a) => a.base).map((a) => [a.base, a])
  )
  console.log(`  ${allPools.length} pools, ${assets.length} assets`)

  // Mirror getRawPoolsOverview: prefer the code-ID allowlist, fall back to the
  // alloyed/transmuter pool types if the allowlist matches nothing. For snapshot
  // generation we intentionally take ALL alloyed/transmuter pools so the
  // committed fallback is not tied to a possibly-stale allowlist.
  const ALLOYED_POOL_TYPES = ["cosmwasm-alloyed", "cosmwasm-transmuter"]
  const data = allPools.filter((p) => ALLOYED_POOL_TYPES.includes(p.type))
  console.log(`  ${data.length} alloyed/transmuter pools to classify`)

  const built = await Promise.all(
    data.map((p) => fillPoolOverview(p, assetMap))
  )

  const pools = built.filter((p) => p.alloy.asset)
  const unsupportedPools = built.filter((p) => !p.alloy.asset)

  if (pools.length === 0) {
    throw new Error(
      "Refusing to write snapshot: classification produced 0 supported pools"
    )
  }

  const result = { pools, unsupportedPools }
  writeFileSync(OUT_PATH, JSON.stringify(result, null, 2) + "\n")

  console.log(
    `\nWrote ${OUT_PATH}\n  supported: ${pools.length}\n  unsupported: ${unsupportedPools.length}`
  )
  console.log(
    "  supported subdenoms:",
    pools
      .map((p) => p.alloy.asset.denom.split("/").pop())
      .sort()
      .join(", ")
  )
}

main().catch((e) => {
  console.error("Snapshot generation failed:", e)
  process.exit(1)
})
