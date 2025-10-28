import _ from "lodash"

import { Limiter, RawLimiterResponse } from "@/types/limiter"

export const getLimiters = async (contractAddress: string) => {
  try {
    const res = await fetch(
      `https://osmosis-rest.publicnode.com/cosmwasm/wasm/v1/contract/${contractAddress}/smart/ewogICJsaXN0X2xpbWl0ZXJzIjoge30KfQ==`
    )

    if (!res.ok) {
      console.warn(`Failed to fetch limiters: ${res.status} ${res.statusText}`)
      return {}
    }

    const response = await res.json()

    const limiters = response.data.limiters as [
      [string, string],
      RawLimiterResponse,
    ][]

    return _.chain(limiters)
      .map(([[k], v]) => {
        if ("static_limiter" in v) {
          return [
            k,
            {
              type: "static",
              ...v.static_limiter,
            },
          ]
        }

        if ("change_limiter" in v) {
          return [
            k,
            {
              type: "change",
              ...v.change_limiter,
            },
          ]
        }
      })
      .compact()
      .fromPairs()
      .value() as _.Dictionary<Limiter>
  } catch (error) {
    console.error("Error fetching limiters: ", error)
    return {}
  }
}
