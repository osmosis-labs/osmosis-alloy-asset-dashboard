import { getPoolsOverview } from "@/services/pool"
import _ from "lodash"

import { variantDenom, variantSymbol } from "@/lib/pool-sources"

// The body stays a plain array for existing consumers; where the data came
// from travels in headers. X-Data-Source is "live", or "runtime" / "snapshot"
// for an older copy served while upstream is down (prices are then null), and
// X-Data-Built-At is when that copy was built.
const json = (
  body: unknown,
  freshness: { source?: string; builtAt?: string }
) =>
  Response.json(body, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "X-Data-Source": freshness.source ?? "unknown",
      ...(freshness.builtAt ? { "X-Data-Built-At": freshness.builtAt } : {}),
    },
  })

export async function loader() {
  const { pools, source, builtAt } = await getPoolsOverview()

  return json(
    pools.map((pool) => ({
      id: pool.id,
      contractAddress: pool.contractAddress,
      assets: pool.reserveCoins?.map(
        (asset) => asset.currency.currency.coinMinimalDenom
      ),
      assetSymbols: _.fromPairs(
        pool.reserveCoins?.map((coin) => [
          variantDenom(coin),
          variantSymbol(coin),
        ])
      ),
      assetNames: _.fromPairs(
        pool.reserveCoins?.map((coin) => [variantDenom(coin), coin.asset?.name])
      ),
      // The decimals the pool build checked against the contract's
      // normalization factors, and whether that check ran; the swap form
      // leaves out unverified pools and any asset whose own assetlist copy
      // says otherwise.
      decimalsVerified: pool.decimalsVerified === true,
      assetDecimals: _.fromPairs(
        pool.reserveCoins?.map((coin) => [
          variantDenom(coin),
          coin.currency.currency.coinDecimals,
        ])
      ),
      alloy: {
        asset: pool.alloy.asset?.denom,
        decimals: pool.alloy.asset?.decimal,
        price: pool.alloy.price?.amount ?? null,
      },
      status: {
        isActive: pool.status?.isActive ?? null,
        corruptedDenoms: pool.status?.corruptedDenoms ?? null,
      },
    })),
    { source, builtAt }
  )
}
