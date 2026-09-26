import { unstable_cache } from "next/cache"
import _ from "lodash"

import { fetchLcd } from "@/lib/utils"

// Display names for routing contracts in the swap table's Route column.
// Names come from, in order: a code-id override for well-known routers, the
// contract's on-chain label when it is meaningful, else nothing (the table
// falls back to a shortened address).

// Well-known router code ids. Skip's entry point and swap adapter carry long
// labels ("Skip Swap Entry Point", "Skip Swap Swap Adapter ...").
const NAMES_BY_CODE_ID: Record<string, string> = {
  "1240": "Skip",
  "1241": "Skip",
}

// Labels that say nothing about the contract.
const GENERIC_LABEL = /^(contract|test|null|undefined|\s*)$/i

const HOSTS = ["https://lcd.osmosis.zone", "https://lcd.archive.osmosis.zone"]

const fetchContractName = async (address: string): Promise<string | null> => {
  for (const host of HOSTS) {
    try {
      const res = await fetchLcd(
        `${host}/cosmwasm/wasm/v1/contract/${address}`,
        { timeoutMs: 10000 }
      )
      if (!res.ok) continue
      const info = (await res.json())?.contract_info
      if (!info) return null
      const byCode = NAMES_BY_CODE_ID[String(info.code_id)]
      if (byCode) return byCode
      const label = String(info.label ?? "").trim()
      return label && !GENERIC_LABEL.test(label) ? label : null
    } catch {
      // Try the next host.
    }
  }
  return null
}

// Contract metadata rarely changes, so a day is plenty.
const getContractNames = unstable_cache(
  async (addresses: string[]): Promise<Record<string, string | null>> =>
    _.fromPairs(
      await Promise.all(
        addresses.map(
          async (a): Promise<[string, string | null]> => [
            a,
            await fetchContractName(a),
          ]
        )
      )
    ),
  ["contract-names-v1"],
  { revalidate: 86400 }
)

// Non-throwing: missing names only fall back to shortened addresses.
export const getContractNamesSafe = async (
  addresses: (string | undefined)[]
): Promise<Record<string, string | null>> => {
  const unique = _.sortBy(_.uniq(_.compact(addresses)))
  if (unique.length === 0) return {}
  try {
    return await getContractNames(unique)
  } catch (e) {
    console.error(`Error resolving contract names: ${e}`)
    return {}
  }
}
