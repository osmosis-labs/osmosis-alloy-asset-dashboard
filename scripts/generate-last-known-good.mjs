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
const BASE_POOLS_URL = `https://app.osmosis.zone/api/edge-trpc-pools/pools.getPools?input=%7B%22json%22%3A%7B%22limit%22%3A100%2C%22types%22%3A%5B%22cosmwasm%22%2C%22cosmwasm-transmuter%22%2C%22cosmwasm-alloyed%22%5D%2C%22minLiquidityUsd%22%3A${MIN_LIQUIDITY}%7D%7D`
const BASE_ASSET_URL = "https://app.osmosis.zone"
const BASE_LIQUIDITY_CHART_URL =
  "https://public-osmosis-api.numia.xyz/pools/liquidity/{poolId}/over_time"
const BASE_PRICE_URL = "https://sqs.osmosis.zone/tokens/prices?base={denoms}"
const BASE_ASSET_LIST =
  "https://raw.githubusercontent.com/osmosis-labs/assetlists/main/osmosis-1/generated/chain_registry/assetlist.json"
const BASE_FRONTEND_ASSET_LIST =
  "https://raw.githubusercontent.com/osmosis-labs/assetlists/main/osmosis-1/generated/frontend/assetlist.json"
const BASE_SMART_QUERY_URL =
  "https://osmosis-rest.publicnode.com/cosmwasm/wasm/v1/contract/{contract}/smart/{query}"
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

// Frontend display names by minimal denom, filled by getAssetStatusMap from
// the same download. Mirrors withFrontendName in src/services/pool.ts:
// reserve coins take the frontend name, the alloy keeps its registry name.
const frontendNames = {}

// Mirror of fetchFrontendAssetMeta in src/services/asset.ts: frontend-assetlist
// operational flags keyed by minimal denom, flagged assets only. Non-fatal:
// an empty map only hides tooltips, the onchain status below stays intact.
const getAssetStatusMap = async () => {
  try {
    const data = await fetchJson(BASE_FRONTEND_ASSET_LIST)
    const assets = data.assets
    if (!Array.isArray(assets) || assets.length === 0) return {}
    const map = {}
    for (const a of assets) {
      if (a.coinMinimalDenom && a.name) frontendNames[a.coinMinimalDenom] = a.name
      const status = {
        unstable: a.unstable === true,
        unstableReason: a.unstableReason ?? null,
        disabled: a.disabled === true,
        haltDeposits: a.haltDeposits === true,
        haltWithdrawals: a.haltWithdrawals === true,
        depositHaltReason: a.depositHaltReason ?? null,
        withdrawalHaltReason: a.withdrawalHaltReason ?? null,
        tooltipMessage: a.tooltipMessage?.trim() || null,
        lastDowntimeDate: a.lastDowntimeDate ?? null,
      }
      const flagged =
        status.unstable ||
        status.disabled ||
        status.haltDeposits ||
        status.haltWithdrawals ||
        !!status.tooltipMessage
      if (flagged && a.coinMinimalDenom) map[a.coinMinimalDenom] = status
    }
    return map
  } catch (e) {
    console.warn(`  frontend assetlist unavailable, no status flags: ${e}`)
    return {}
  }
}

// Mirror of getPoolContractStatus in src/services/transmuter.ts. null means
// "unknown" and is preserved as such; it is never defaulted to active/empty.
const smartQuery = async (contractAddress, msg) => {
  try {
    const url = BASE_SMART_QUERY_URL.replace(
      "{contract}",
      contractAddress
    ).replace("{query}", Buffer.from(JSON.stringify(msg)).toString("base64"))
    const res = await fetch(url)
    if (!res.ok) return null
    const body = await res.json()
    return body?.data ?? null
  } catch {
    return null
  }
}

const getPoolContractStatus = async (contractAddress) => {
  const [active, corrupted] = await Promise.all([
    smartQuery(contractAddress, { is_active: {} }),
    smartQuery(contractAddress, { get_corrupted_denoms: {} }),
  ])
  return {
    isActive: typeof active?.is_active === "boolean" ? active.is_active : null,
    corruptedDenoms: Array.isArray(corrupted?.corrupted_denoms)
      ? corrupted.corrupted_denoms
      : null,
  }
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

// Mirror of src/services/provenance.ts: follow `ibc` hops through upstream
// cosmos/chain-registry until the first non-IBC trace; its counterparty chain
// is the origin and its provider the issuer. Filled in main() before pools are
// mapped. Non-fatal: missing entries fall back to the last-hop label in the UI.
const CHAIN_REGISTRY =
  "https://raw.githubusercontent.com/cosmos/chain-registry/master"
const TRANSFER_TRACES = new Set(["ibc", "ibc-cw20"])
const ISSUER_LABELS = { "BitGo, Kyber, and Ren": "WBTC" }
const ORIGIN_LABELS = {
  xrpl: "XRPL",
  bnbsmartchain: "BNB Smart Chain",
  cosmoshub: "Cosmos Hub",
}
const startCase = (s) =>
  s
    .replace(/([a-z])([A-Z0-9])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ")
const originLabel = (chain) => ORIGIN_LABELS[chain] ?? startCase(chain)
const issuerLabel = (provider) => ISSUER_LABELS[provider] ?? provider
const provenanceByDenom = {}

const resolveProvenance = async (denoms, assetMap) => {
  const chains = new Map()
  const loadChain = (chain) => {
    if (!chains.has(chain)) {
      chains.set(
        chain,
        fetchJson(`${CHAIN_REGISTRY}/${chain}/assetlist.json`).then((d) =>
          Object.fromEntries((d.assets ?? []).map((a) => [a.base, a]))
        )
      )
    }
    return chains.get(chain)
  }
  for (const denom of denoms) {
    try {
      let traces = assetMap[denom]?.traces
      let chain = null
      let result = { origin: null, issuer: null }
      for (let hop = 0; hop < 6; hop++) {
        const trace = traces?.[0]
        if (!trace) {
          result = { origin: chain && originLabel(chain), issuer: null }
          break
        }
        const cp = trace.counterparty
        if (!TRANSFER_TRACES.has(trace.type ?? "")) {
          result = {
            origin: cp?.chain_name ? originLabel(cp.chain_name) : null,
            issuer: trace.provider ? issuerLabel(trace.provider) : null,
          }
          break
        }
        if (!cp?.chain_name || !cp.base_denom) break
        chain = cp.chain_name
        const next = (await loadChain(chain))[cp.base_denom]
        if (!next) break
        traces = next.traces
      }
      provenanceByDenom[denom] = result
    } catch (e) {
      console.warn(`  provenance unavailable for ${denom}: ${e}`)
    }
  }
}

const mapReserveCoins = (pool, assetMap) =>
  pool.reserveCoins.map((coin) => {
    const c = JSON.parse(coin)
    const asset = assetMap[c.currency.coinMinimalDenom]
    const frontendName = frontendNames[c.currency.coinMinimalDenom]
    return {
      asset: asset && frontendName ? { ...asset, name: frontendName } : asset,
      provenance: provenanceByDenom[c.currency.coinMinimalDenom] ?? null,
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
const fillPoolOverview = async (pool, assetMap, statusMap = {}) => {
  const alloyDenom = calcAlloyDenom(
    pool.raw.contract_address,
    pool.raw.instantiate_msg
  )
  const alloyAssetDetail = assetMap[alloyDenom]

  const isSingleAsset = pool.reserveCoins.length === 1

  const tvlUsd = Number(JSON.parse(pool.totalFiatValueLocked).amount)
  const isBelowMinTvl =
    Number.isFinite(tvlUsd) && tvlUsd < MIN_SUPPORTED_TVL_USD

  if (!alloyAssetDetail || isSingleAsset || isBelowMinTvl) {
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
      status: null,
    }
  }

  const reserveDenoms = pool.reserveCoins.map(
    (coin) => JSON.parse(coin).currency.coinMinimalDenom
  )

  const [liquidityChart, prices, limiters, contractStatus] = await Promise.all([
    getLiquidityChart(pool.id),
    getPrices(reserveDenoms),
    getLimiters(pool.raw.contract_address),
    getPoolContractStatus(pool.raw.contract_address),
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
    status: {
      ...contractStatus,
      alloy: statusMap[alloyDenom] ?? null,
      reserves: Object.fromEntries(
        reserveDenoms.filter((d) => statusMap[d]).map((d) => [d, statusMap[d]])
      ),
    },
  }
}

const main = async () => {
  console.log("Fetching pools + assetlist ...")
  const [poolsResponse, assets, statusMap] = await Promise.all([
    fetchJson(BASE_POOLS_URL),
    getAssets(),
    getAssetStatusMap(),
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

  await resolveProvenance(
    [
      ...new Set(
        data.flatMap((p) =>
          p.reserveCoins.map((c) => JSON.parse(c).currency.coinMinimalDenom)
        )
      ),
    ],
    assetMap
  )

  const built = await Promise.all(
    data.map((p) => fillPoolOverview(p, assetMap, statusMap))
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
  const frozen = pools.filter((p) => p.status.isActive === false)
  const unknown = pools.filter((p) => p.status.isActive === null)
  const corrupted = pools.filter((p) => p.status.corruptedDenoms?.length)
  const symbols = (ps) =>
    ps.map((p) => p.alloy.asset.symbol).join(", ") || "none"
  console.log(`  frozen: ${symbols(frozen)}`)
  console.log(`  status unknown: ${symbols(unknown)}`)
  console.log(`  with corrupted assets: ${symbols(corrupted)}`)
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
