import _ from "lodash"

import { getAssetImageUrl } from "@/lib/utils"

import { getAssetMap, getFrontendAssetSymbolsSafe } from "./asset"

export type DenomMeta = { symbol: string; decimals: number; image?: string }

// Symbol (the frontend's where it has one), decimals and icon for arbitrary
// denoms, from the assetlist. For denoms in a pool's history but not in its
// current reserves: the pools API omits a variant whose balance is zero, and
// a removed variant stays in the history. Non-throwing: a denom that cannot
// be resolved is left out, so callers show it as unavailable instead of
// guessing its decimals.
export const getDenomMetaSafe = async (
  denoms: string[]
): Promise<Record<string, DenomMeta>> => {
  if (denoms.length === 0) return {}
  try {
    const [assetMap, symbols] = await Promise.all([
      getAssetMap(),
      getFrontendAssetSymbolsSafe(),
    ])
    return _.fromPairs(
      _.compact(
        _.uniq(denoms).map((denom) => {
          const asset = assetMap[denom]
          if (!asset) return null
          return [
            denom,
            {
              symbol: symbols[denom] ?? asset.symbol,
              decimals: asset.decimal,
              image: getAssetImageUrl(asset),
            },
          ]
        })
      )
    )
  } catch (e) {
    console.error(`Error resolving denom metadata: ${e}`)
    return {}
  }
}
