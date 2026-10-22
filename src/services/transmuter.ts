import { PoolStatus } from "@/types/pool"
import { fetchWithRetry } from "@/lib/utils"

// Same LCD the limiter query already uses.
const BASE_SMART_QUERY_URL =
  "https://osmosis-rest.publicnode.com/cosmwasm/wasm/v1/contract/{contract}/smart/{query}"
// An independent provider the frozen and corrupted state is checked against
// (the reserve snapshots' first LCD, src/services/reserves.ts). One faulty or
// lagging node must not be able to show a frozen pool as active or hide a
// corrupted constituent on its own.
const CROSS_CHECK_SMART_QUERY_URL =
  "https://osmosis-api.polkachu.com/cosmwasm/wasm/v1/contract/{contract}/smart/{query}"

const encodeQuery = (msg: object) =>
  Buffer.from(JSON.stringify(msg)).toString("base64")

// Runs one smart query and returns its `data`, or null when the LCD or the
// contract rejected it. Callers must treat null as "unknown", not as a value.
const smartQuery = async <T>(
  contractAddress: string,
  msg: object,
  baseUrl = BASE_SMART_QUERY_URL
): Promise<T | null> => {
  const url = baseUrl
    .replace("{contract}", contractAddress)
    .replace("{query}", encodeQuery(msg))
  try {
    const res = await fetchWithRetry(url)
    if (!res.ok) {
      console.warn(
        `Smart query ${JSON.stringify(msg)} on ${contractAddress} failed: ${res.status} ${res.statusText}`
      )
      return null
    }
    const body = await res.json()
    return (body?.data ?? null) as T | null
  } catch (e) {
    console.error(
      `Error running smart query ${JSON.stringify(msg)} on ${contractAddress}: ${e}`
    )
    return null
  }
}

// Onchain operational state of a transmuter pool. The two queries are
// independent, so one failing does not blank the other; each unknown is
// reported as null rather than a guessed default. `is_active` false means the
// moderator froze the contract (joins, swaps and exit_pool all fail with
// InactivePool). `get_corrupted_denoms` lists constituents the moderator marked
// corrupted (they may never increase in amount or weight within the pool).
//
// Each query runs on two independent LCDs and a value is only reported when
// both return it and agree; a failure or a disagreement on either is null
// (unknown), which the UI shows as unknown.
export const getPoolContractStatus = async (
  contractAddress: string
): Promise<Pick<PoolStatus, "isActive" | "corruptedDenoms">> => {
  const both = <T>(msg: object) =>
    Promise.all(
      [BASE_SMART_QUERY_URL, CROSS_CHECK_SMART_QUERY_URL].map((url) =>
        smartQuery<T>(contractAddress, msg, url)
      )
    )
  const [actives, corrupteds] = await Promise.all([
    both<{ is_active: boolean }>({ is_active: {} }),
    both<{ corrupted_denoms: string[] }>({ get_corrupted_denoms: {} }),
  ])

  return {
    isActive: agreed(
      actives.map((a) =>
        typeof a?.is_active === "boolean" ? a.is_active : null
      ),
      contractAddress,
      "is_active"
    ),
    corruptedDenoms: agreed(
      corrupteds.map((c) =>
        Array.isArray(c?.corrupted_denoms) &&
        c.corrupted_denoms.every((d) => typeof d === "string")
          ? [...c.corrupted_denoms].sort()
          : null
      ),
      contractAddress,
      "get_corrupted_denoms"
    ),
  }
}

// The value both LCDs returned, or null when either failed or they differ.
const agreed = <T>(
  values: (T | null)[],
  contractAddress: string,
  query: string
): T | null => {
  if (values.some((v) => v === null)) return null
  const [first, ...rest] = values as T[]
  if (rest.some((v) => JSON.stringify(v) !== JSON.stringify(first))) {
    console.warn(
      `LCDs disagree on ${query} for ${contractAddress}: ${JSON.stringify(values)}`
    )
    return null
  }
  return first
}

// The pool's accounted reserves (`get_total_pool_liquidity`), or null when the
// query failed.
export const getTotalPoolLiquidity = async (
  contractAddress: string
): Promise<{ denom: string; amount: string }[] | null> => {
  const data = await smartQuery<{
    total_pool_liquidity: { denom: string; amount: string }[]
  }>(contractAddress, { get_total_pool_liquidity: {} })
  return Array.isArray(data?.total_pool_liquidity)
    ? data.total_pool_liquidity
    : null
}

// Each asset's `normalization_factor` (variants and the alloy), by denom, or
// null when the query failed.
export const getNormalizationFactors = async (
  contractAddress: string
): Promise<Record<string, string> | null> => {
  const data = await smartQuery<{
    asset_configs: { denom: string; normalization_factor: string }[]
  }>(contractAddress, { list_asset_configs: {} })
  if (!Array.isArray(data?.asset_configs)) return null
  const factors: Record<string, string> = {}
  for (const c of data.asset_configs) {
    if (
      typeof c?.denom !== "string" ||
      !/^[1-9]\d*$/.test(c.normalization_factor ?? "")
    )
      return null
    factors[c.denom] = c.normalization_factor
  }
  return factors
}
