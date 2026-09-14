import { PoolStatus } from "@/types/pool"
import { fetchWithRetry } from "@/lib/utils"

// Same LCD the limiter query already uses.
const BASE_SMART_QUERY_URL =
  "https://osmosis-rest.publicnode.com/cosmwasm/wasm/v1/contract/{contract}/smart/{query}"

const encodeQuery = (msg: object) =>
  Buffer.from(JSON.stringify(msg)).toString("base64")

// Runs one smart query and returns its `data`, or null when the LCD or the
// contract rejected it. Callers must treat null as "unknown", not as a value.
const smartQuery = async <T>(
  contractAddress: string,
  msg: object
): Promise<T | null> => {
  const url = BASE_SMART_QUERY_URL.replace(
    "{contract}",
    contractAddress
  ).replace("{query}", encodeQuery(msg))
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
export const getPoolContractStatus = async (
  contractAddress: string
): Promise<Pick<PoolStatus, "isActive" | "corruptedDenoms">> => {
  const [active, corrupted] = await Promise.all([
    smartQuery<{ is_active: boolean }>(contractAddress, { is_active: {} }),
    smartQuery<{ corrupted_denoms: string[] }>(contractAddress, {
      get_corrupted_denoms: {},
    }),
  ])

  return {
    isActive: typeof active?.is_active === "boolean" ? active.is_active : null,
    corruptedDenoms: Array.isArray(corrupted?.corrupted_denoms)
      ? corrupted.corrupted_denoms
      : null,
  }
}
