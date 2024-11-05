import { Metadata } from "next"
import { getAssetMap } from "@/services/asset"
import { getPoolsOverview } from "@/services/pool"

import { SupportedPoolsTable } from "./supported-pools-table"
import { UnsupportedPoolsTable } from "./unsupported-pools-table"

export const metadata: Metadata = {
  title: "All Pools",
  description:
    "List of all alloy/transmuter pools. Including supported and unsupported pools.",
}

export const runtime = "edge"
export const revalidate = 3600 // 1 hour

export default async function Home() {
  const [{ pools, unsupportedPools }, assets] = await Promise.all([
    getPoolsOverview(),
    getAssetMap(),
  ])

  return (
    <main className="container my-6 flex flex-col gap-6">
      <h1 className="text-4xl font-bold">Pools</h1>
      <h2 className="text-2xl font-semibold">Supported Pools</h2>
      <div className="rounded-md border">
        <SupportedPoolsTable pools={pools} />
      </div>

      <div className="space-y-1">
        <h2 className="text-2xl font-semibold">Not Supported Pools</h2>
        <p className="text-muted-foreground">
          Newly created pools, pools with unsupported assets, pools under $10
          liquidity, or pools with 1 asset.
        </p>
      </div>
      <div className="rounded-md border">
        <UnsupportedPoolsTable pools={unsupportedPools} assets={assets} />
      </div>
    </main>
  )
}
