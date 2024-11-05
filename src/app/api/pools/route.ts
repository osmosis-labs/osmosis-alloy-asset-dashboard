import { NextResponse } from "next/server"
import { getPoolsOverview } from "@/services/pool"

export const runtime = "edge"
export const revalidate = 3600

export async function GET() {
  const { pools } = await getPoolsOverview()

  return NextResponse.json(
    pools.map((pool) => ({
      id: pool.id,
      assets: pool.assets?.map((asset) => asset.denom),
      alloy: {
        asset: pool.alloy.asset.denom,
        price: pool.alloy.price?.amount || "0",
      },
    }))
  )
}
