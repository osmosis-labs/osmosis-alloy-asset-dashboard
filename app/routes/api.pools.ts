import { getPoolsOverview } from "@/services/pool"
import _ from "lodash"

import { variantDenom, variantSymbol } from "@/lib/pool-sources"

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "public, max-age=300" },
  })

export async function loader() {
  const { pools } = await getPoolsOverview()

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
      alloy: {
        asset: pool.alloy.asset?.denom,
        price: pool.alloy.price?.amount ?? null,
      },
      status: {
        isActive: pool.status?.isActive ?? null,
        corruptedDenoms: pool.status?.corruptedDenoms ?? null,
      },
    }))
  )
}
