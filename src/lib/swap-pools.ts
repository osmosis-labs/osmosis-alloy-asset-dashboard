import type { AssetWithDecimal } from "@/types/asset"
import type { MinimalAssetPool, MinimalPool } from "@/types/pool"

// Builds the swap form's pools from the pools API and the assetlist (keyed by
// denom). A variant without assetlist metadata is left out of its pool (its
// decimals are unknown, so no amount could be converted); a pool whose alloy
// asset has no metadata, or with no variants left, is left out entirely.
// Throws when nothing usable remains, so the page shows an error rather than
// a form built on missing data.
//
// The pools API also sends the decimals the server checked against each
// contract's normalization factors. An asset whose assetlist copy here has
// other decimals (a list updated between the two fetches) is treated like
// one without metadata: amounts are converted with these decimals, so a
// mismatch would sign the wrong amount. A pool the server could not verify
// (the contract query failed, or a snapshot served during an outage) is
// left out until it can.
export const buildSwapPools = (
  pools: MinimalPool[],
  assets: Record<string, AssetWithDecimal>
): MinimalAssetPool[] => {
  if (Object.keys(assets).length === 0) {
    throw new Error("Asset list unavailable")
  }
  const verified = (asset: AssetWithDecimal | undefined, decimals?: number) =>
    asset && (decimals === undefined || asset.decimal === decimals)
      ? asset
      : undefined
  const built = pools.flatMap((pool): MinimalAssetPool[] => {
    if (pool.decimalsVerified === false) return []
    const alloy = verified(assets[pool.alloy.asset], pool.alloy.decimals)
    // Label variants with the frontend symbol and name (USDC.noble,
    // "USDC (Noble)") rather than the chain-registry ones, which are plain
    // "USDC" for several variants.
    const variants = pool.assets.flatMap((denom) => {
      const asset = verified(assets[denom], pool.assetDecimals?.[denom])
      if (!asset) return []
      return [
        {
          ...asset,
          symbol: pool.assetSymbols?.[denom] ?? asset.symbol,
          name: pool.assetNames?.[denom] ?? asset.name,
        },
      ]
    })
    if (!alloy || variants.length === 0) return []
    return [
      {
        id: pool.id,
        contractAddress: pool.contractAddress,
        assets: variants,
        alloy: { asset: alloy, price: pool.alloy.price },
        status: pool.status ?? { isActive: null, corruptedDenoms: null },
      },
    ]
  })
  if (built.length === 0) throw new Error("No pools available")
  return built
}
