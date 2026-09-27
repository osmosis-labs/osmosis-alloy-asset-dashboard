import _ from "lodash"

import { Limiter, RawLimiterResponse } from "@/types/limiter"
import { fetchWithRetry } from "@/lib/utils"

// Every limiter on a transmuter pool, by constituent denom. A denom can carry
// several (the contract keys them by denom and label), so each maps to a
// list. Returns null when the query failed: unknown, which the UI must not
// show as "no limiters".
export const getLimiters = async (
  contractAddress: string
): Promise<_.Dictionary<Limiter[]> | null> => {
  try {
    const res = await fetchWithRetry(
      `https://osmosis-rest.publicnode.com/cosmwasm/wasm/v1/contract/${contractAddress}/smart/ewogICJsaXN0X2xpbWl0ZXJzIjoge30KfQ==`
    )

    if (!res.ok) {
      console.warn(`Failed to fetch limiters: ${res.status} ${res.statusText}`)
      return null
    }

    const response = await res.json()

    const limiters = response.data.limiters as [
      [string, string],
      RawLimiterResponse,
    ][]

    return _.chain(limiters)
      .map(([[denom], v]): [string, Limiter] | null => {
        if ("static_limiter" in v) {
          return [denom, { type: "static", ...v.static_limiter }]
        }
        if ("change_limiter" in v) {
          return [denom, { type: "change", ...v.change_limiter }]
        }
        return null
      })
      .compact()
      .groupBy(([denom]) => denom)
      .mapValues((pairs) => pairs.map(([, limiter]) => limiter))
      .value()
  } catch (error) {
    console.error("Error fetching limiters: ", error)
    return null
  }
}
