import { NextResponse } from "next/server"
import { getPoolsOverview } from "@/services/pool"
import _ from "lodash"

import { variantDenom, variantSymbol } from "@/lib/pool-sources"

export const revalidate = 3600
// Above Vercel's 15s default; see src/app/page.tsx.
export const maxDuration = 60

export async function GET() {
  const { pools } = await getPoolsOverview()

  return NextResponse.json(
    pools.map((pool) => ({
      id: pool.id,
      assets: pool.reserveCoins?.map(
        (asset) => asset.currency.currency.coinMinimalDenom
      ),
      // Frontend symbols per variant (USDC.noble, not the chain-registry
      // "USDC"), so clients can label variants the way the Osmosis app does.
      assetSymbols: _.fromPairs(
        pool.reserveCoins?.map((coin) => [
          variantDenom(coin),
          variantSymbol(coin),
        ])
      ),
      alloy: {
        asset: pool.alloy.asset?.denom,
        price: pool.alloy.price?.amount || "0",
      },
      // Unknown stays unknown: an overview built before this field existed
      // must not be reported as active.
      status: {
        isActive: pool.status?.isActive ?? null,
        corruptedDenoms: pool.status?.corruptedDenoms ?? null,
      },
    }))
  )
}
