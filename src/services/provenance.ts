import { unstable_cache } from "next/cache"
import _ from "lodash"

import { fetchJsonWithRetry } from "@/lib/utils"

import { getAssetMap } from "./asset"

// Where a variant comes from, resolved through the chain registry:
//   origin: the chain of issue (Ethereum, Base, Bitcoin, XRPL)
//   issuer: the bridge or minting provider (Axelar, Eureka, Circle, WBTC)
// Osmosis's generated assetlist only records the last IBC hop (so every
// Axelar variant looks like it comes "from Axelar"). Upstream
// cosmos/chain-registry stores one hop per chain, linked by counterparty
// chain_name + base_denom, so the full path is recovered by following `ibc`
// hops until the first non-IBC trace (bridge, ibc-bridge, additional-mintage,
// ...): its counterparty chain is the origin and its provider the issuer.
export type Provenance = {
  origin: string | null
  issuer: string | null
}

type Trace = {
  type?: string
  provider?: string
  counterparty?: { chain_name?: string; base_denom?: string }
}

const CHAIN_REGISTRY =
  "https://raw.githubusercontent.com/cosmos/chain-registry/master"
const CHAIN_REGISTRY_MIRROR =
  "https://cdn.jsdelivr.net/gh/cosmos/chain-registry@master"

// Hops that only move the token between chains; keep walking past them.
const TRANSFER_TRACES = new Set(["ibc", "ibc-cw20"])
const MAX_HOPS = 6

// Registry provider strings that read badly as labels.
const ISSUER_LABELS: Record<string, string> = {
  "BitGo, Kyber, and Ren": "WBTC",
}
// Registry chain names whose start-cased form is wrong.
const ORIGIN_LABELS: Record<string, string> = {
  xrpl: "XRPL",
  bnbsmartchain: "BNB Smart Chain",
  cosmoshub: "Cosmos Hub",
}

export const issuerLabel = (provider: string) =>
  ISSUER_LABELS[provider] ?? provider
export const originLabel = (chainName: string) =>
  ORIGIN_LABELS[chainName] ?? _.startCase(chainName)

const fetchChainAssets = async (chainName: string) => {
  const path = `${chainName}/assetlist.json`
  const data = await fetchJsonWithRetry<{
    assets: { base: string; traces?: Trace[] }[]
  }>([`${CHAIN_REGISTRY}/${path}`, `${CHAIN_REGISTRY_MIRROR}/${path}`], {
    timeoutMs: 20000,
  })
  return _.keyBy(data?.assets ?? [], "base")
}

const resolve = async (
  firstTraces: Trace[] | undefined,
  loadChain: (chainName: string) => Promise<_.Dictionary<{ traces?: Trace[] }>>
): Promise<Provenance> => {
  let traces = firstTraces
  let chain: string | null = null
  for (let hop = 0; hop < MAX_HOPS; hop++) {
    const trace = traces?.[0]
    // No further trace: the asset is native to the chain we reached.
    if (!trace) return { origin: chain && originLabel(chain), issuer: null }

    const counterparty = trace.counterparty
    if (!TRANSFER_TRACES.has(trace.type ?? "")) {
      return {
        origin: counterparty?.chain_name
          ? originLabel(counterparty.chain_name)
          : null,
        issuer: trace.provider ? issuerLabel(trace.provider) : null,
      }
    }
    if (!counterparty?.chain_name || !counterparty.base_denom) break
    chain = counterparty.chain_name
    const next = (await loadChain(chain))[counterparty.base_denom]
    if (!next) break
    traces = next.traces
  }
  return { origin: null, issuer: null }
}

// Provenance by minimal denom for the given Osmosis denoms. Cached for a day:
// bridge paths change rarely, and each resolve fetches a few small
// chain-registry files. Throws on fetch failure so a failure is not cached.
const fetchVariantProvenance = async (
  denoms: string[]
): Promise<Record<string, Provenance>> => {
  const assetMap = await getAssetMap()
  const chains = new Map<string, Promise<_.Dictionary<{ traces?: Trace[] }>>>()
  const loadChain = (chainName: string) => {
    if (!chains.has(chainName))
      chains.set(chainName, fetchChainAssets(chainName))
    return chains.get(chainName)!
  }
  const entries = await Promise.all(
    denoms.map(async (denom) => [
      denom,
      await resolve(assetMap[denom]?.traces as Trace[] | undefined, loadChain),
    ])
  )
  return _.fromPairs(entries)
}

const getVariantProvenance = unstable_cache(
  fetchVariantProvenance,
  ["variant-provenance"],
  { revalidate: 86400 }
)

// Non-throwing: a missing map only falls back to the last-hop chain label.
export const getVariantProvenanceSafe = async (
  denoms: string[]
): Promise<Record<string, Provenance>> => {
  try {
    return await getVariantProvenance(_.sortBy(_.uniq(denoms)))
  } catch (e) {
    console.error(`Error resolving variant provenance: ${e}`)
    return {}
  }
}
