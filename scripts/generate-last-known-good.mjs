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
// PoolsOverviewResult ({ pools, unsupportedPools, builtAt }).
//
// Usage:  node scripts/generate-last-known-good.mjs
// (Node 22.18 or later: it imports the migration list from a .ts file.)
//
// It writes the JSON next to the service that consumes it and prints a summary.

import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { MIGRATION_ALLOYS } from "../src/constants/migration.ts"

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
const MIN_SUPPORTED_TVL_USD = 10_000
const BASE_POOLS_URL = `https://app.osmosis.zone/api/edge-trpc-pools/pools.getPools?input=%7B%22json%22%3A%7B%22limit%22%3A100%2C%22types%22%3A%5B%22cosmwasm%22%2C%22cosmwasm-transmuter%22%2C%22cosmwasm-alloyed%22%5D%2C%22minLiquidityUsd%22%3A${MIN_LIQUIDITY}%7D%7D`
const BASE_ASSET_URL = "https://app.osmosis.zone"
const BASE_LIQUIDITY_CHART_URL =
  "https://public-osmosis-api.numia.xyz/pools/liquidity/{poolId}/over_time"
const BASE_PRICE_URL =
  "https://sqsprod.osmosis.zone/tokens/prices?base={denoms}"
const BASE_SQS_POOLS_URL = "https://sqsprod.osmosis.zone/pools?IDs={ids}"
const BASE_POOLMANAGER_POOL_URL =
  "https://osmosis-rest.publicnode.com/osmosis/poolmanager/v1beta1/pools/{poolId}"
const BASE_ASSET_LIST =
  "https://raw.githubusercontent.com/osmosis-labs/assetlists/main/osmosis-1/generated/chain_registry/assetlist.json"
const BASE_FRONTEND_ASSET_LIST =
  "https://raw.githubusercontent.com/osmosis-labs/assetlists/main/osmosis-1/generated/frontend/assetlist.json"
const BASE_SMART_QUERY_URL =
  "https://osmosis-rest.publicnode.com/cosmwasm/wasm/v1/contract/{contract}/smart/{query}"
const BASE_ASSET_PRICE =
  "https://app.osmosis.zone/api/edge-trpc-assets/assets.getAssetPrice?input=%7B%22json%22:%7B%22coinMinimalDenom%22:%22{denom}%22%7D%7D"

const FIAT_OPTS = {
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
}

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
  // Decimals from the display unit; assets without one are skipped.
  return assets.flatMap((a) => {
    const unit = a.denom_units.find(
      (u) => u.denom === a.display || u.aliases?.includes(a.display)
    )
    if (typeof unit?.exponent !== "number") return []
    return [{ ...a, denom: a.denom_units[0].denom, decimal: unit.exponent }]
  })
}

// Frontend display names and symbols by minimal denom, filled by
// getAssetStatusMap from the same download. Mirrors withFrontendName in
// src/services/pool.ts: reserve coins take the frontend name, the alloy keeps
// its registry name.
const frontendNames = {}
const frontendSymbols = {}

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
      if (a.coinMinimalDenom && a.symbol)
        frontendSymbols[a.coinMinimalDenom] = a.symbol
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

// Mirror of getLimiters in src/services/limiter.ts (list_limiters smart query):
// a list per denom, null when the query failed.
const getLimiters = async (contractAddress) => {
  try {
    const res = await fetch(
      `https://osmosis-rest.publicnode.com/cosmwasm/wasm/v1/contract/${contractAddress}/smart/ewogICJsaXN0X2xpbWl0ZXJzIjoge30KfQ==`
    )
    if (!res.ok) return null
    const response = await res.json()
    const limiters = response.data.limiters
    const out = {}
    for (const [[k], v] of limiters) {
      const limiter =
        "static_limiter" in v
          ? { type: "static", ...v.static_limiter }
          : "change_limiter" in v
            ? { type: "change", ...v.change_limiter }
            : null
      if (limiter) (out[k] ??= []).push(limiter)
    }
    return out
  } catch {
    return null
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
    for (const [k, v] of Object.entries(d)) {
      const price = Number(Object.values(v)[0])
      if (Number.isFinite(price) && price > 0) out[k] = price
    }
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

// Mirror of byPrevalence in src/services/pool.ts: most prevalent variant
// first (the variants of one alloy share a unit, so display amounts compare).
const reserveDisplayAmount = (c) =>
  Number(c.currency.amount) / 10 ** c.currency.currency.coinDecimals
const appImageUrl = (url) =>
  url?.startsWith("/") ? `${BASE_ASSET_URL}${url}` : (url ?? "")
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
          coinImageUrl: appImageUrl(c.currency.coinImageUrl),
        },
      },
    }
  }).sort((a, b) => reserveDisplayAmount(b) - reserveDisplayAmount(a))

const marketFiat = (value) => (value ? JSON.parse(value) : null)
const market = (pool) => ({
  volume24hUsd: marketFiat(pool.market?.volume24hUsd),
  volume7dUsd: marketFiat(pool.market?.volume7dUsd),
  feesSpent24hUsd: marketFiat(pool.market?.feesSpent24hUsd),
  feesSpent7dUsd: marketFiat(pool.market?.feesSpent7dUsd),
})

// Mirror of migrationAlloyAsset in src/services/pool.ts.
const migrationAlloyAsset = (pool, alloyDenom, migration, assetMap) => {
  const coins = pool.reserveCoins.map((c) => JSON.parse(c).currency)
  const from = coins.find((c) => c.coinMinimalDenom === migration.from)
  const to = coins.find((c) => c.coinMinimalDenom === migration.to)
  if (!from || !to || from.coinDecimals !== to.coinDecimals) return undefined
  const symbol = alloyDenom.split("/").at(-1)
  const toName =
    to.coinName ?? assetMap[to.coinMinimalDenom]?.name ?? to.coinDenom
  const fromName =
    from.coinName ?? assetMap[from.coinMinimalDenom]?.name ?? from.coinDenom
  return {
    base: alloyDenom,
    denom: alloyDenom,
    display: symbol,
    symbol,
    name: `${toName} Migration`,
    description: `Swaps ${from.coinDenom} (${fromName}) for ${to.coinDenom} 1:1. This pool exists for the token migration: its alloyed token, ${symbol}, is not a listed asset.`,
    denom_units: [
      { denom: alloyDenom, exponent: 0 },
      { denom: symbol, exponent: to.coinDecimals },
    ],
    decimal: to.coinDecimals,
    type_asset: "sdk.coin",
    address: pool.raw.contract_address,
    traces: [],
    images: assetMap[to.coinMinimalDenom]?.images ?? [],
    keywords: [],
  }
}

// Mirror of getMigrationRawPools in src/services/pool.ts.
const getMigrationRawPools = async (poolIds, assetMap) => {
  if (poolIds.length === 0) return []
  let caps = {}
  try {
    const data = await fetchJson(
      BASE_SQS_POOLS_URL.replace("{ids}", poolIds.join(","))
    )
    for (const p of data) {
      if (p.chain_model?.pool_id !== undefined && p.liquidity_cap !== undefined)
        caps[String(p.chain_model.pool_id)] = p.liquidity_cap
    }
  } catch (e) {
    console.warn(`  SQS pools unavailable, no migration supplements: ${e}`)
    return []
  }
  const pools = await Promise.all(
    poolIds.map(async (poolId) => {
      try {
        const { pool } = await fetchJson(
          BASE_POOLMANAGER_POOL_URL.replace("{poolId}", poolId)
        )
        const liquidity = (
          await smartQuery(pool.contract_address, {
            get_total_pool_liquidity: {},
          })
        )?.total_pool_liquidity
        const cap = caps[poolId]
        if (!Array.isArray(liquidity) || cap === undefined)
          throw new Error("reserves or value unavailable")
        const reserveCoins = liquidity.map(({ denom, amount }) => {
          const asset = assetMap[denom]
          if (!asset) throw new Error(`no assetlist entry for ${denom}`)
          return JSON.stringify({
            currency: {
              coinDenom: frontendSymbols[denom] ?? asset.symbol,
              coinName: frontendNames[denom] ?? asset.name,
              coinMinimalDenom: denom,
              coinDecimals: asset.decimal,
              coinImageUrl: asset.images?.[0]?.svg || asset.images?.[0]?.png || "",
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
        console.warn(`  migration pool ${poolId} unavailable: ${e}`)
        return null
      }
    })
  )
  return pools.filter(Boolean)
}

// Mirror of fillPoolOverview in src/services/pool.ts.
const fillPoolOverview = async (pool, assetMap, statusMap = {}) => {
  const alloyDenom = calcAlloyDenom(
    pool.raw.contract_address,
    pool.raw.instantiate_msg
  )
  const migration = MIGRATION_ALLOYS[pool.id]
  const alloyAssetDetail = migration
    ? migrationAlloyAsset(pool, alloyDenom, migration, assetMap)
    : assetMap[alloyDenom]

  const tvlUsd = Number(JSON.parse(pool.totalFiatValueLocked).amount)
  const isBelowMinTvl =
    !migration && Number.isFinite(tvlUsd) && tvlUsd < MIN_SUPPORTED_TVL_USD
  const hasUnknownDecimals = pool.reserveCoins.some(
    (c) => typeof JSON.parse(c).currency.coinDecimals !== "number"
  )

  if (!alloyAssetDetail || isBelowMinTvl || hasUnknownDecimals) {
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
    kind: migration ? "migration" : "alloy",
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
  const listedPools = allPools.filter((p) =>
    ALLOYED_POOL_TYPES.includes(p.type)
  )
  const listedIds = new Set(listedPools.map((p) => p.id))
  const supplemented = await getMigrationRawPools(
    Object.keys(MIGRATION_ALLOYS).filter((id) => !listedIds.has(id)),
    assetMap
  )
  const data = [...listedPools, ...supplemented]
  console.log(
    `  ${data.length} alloyed/transmuter pools to classify (${supplemented.length} migration pools built from chain data)`
  )

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

  if (!pools.some((p) => p.kind !== "migration")) {
    throw new Error(
      "Refusing to write snapshot: classification produced 0 supported pools"
    )
  }

  const result = { pools, unsupportedPools, builtAt: new Date().toISOString() }
  writeFileSync(OUT_PATH, JSON.stringify(result, null, 2) + "\n")

  console.log(
    `\nWrote ${OUT_PATH}\n  supported: ${pools.length} (${pools.filter((p) => p.kind === "migration").length} migration)\n  unsupported: ${unsupportedPools.length}`
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
