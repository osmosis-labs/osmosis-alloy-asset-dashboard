import { getPoolsOverview, isMigrationPool } from "@/services/pool"

import { DataFreshnessNotice } from "@/components/data-freshness"
import { OverviewChart } from "@/components/overview-chart"
import { PoolCard } from "@/components/pool-card"

import { cachedPageHeaders, pageMeta } from "../meta"
import type { Route } from "./+types/home"

export const meta: Route.MetaFunction = () => pageMeta()

export const headers: Route.HeadersFunction = ({ errorHeaders }) =>
  cachedPageHeaders({ errorHeaders })

export async function loader() {
  const overview = await getPoolsOverview()
  return {
    source: overview.source,
    builtAt: overview.builtAt,
    // Migration alloys are listed on /pools, not here.
    pools: overview.pools.filter((pool) => !isMigrationPool(pool)),
  }
}

export default function Home({ loaderData }: Route.ComponentProps) {
  const { pools } = loaderData

  return (
    <main className="flex items-center justify-center">
      <div className="container my-6 flex flex-col items-center gap-6 text-center">
        <DataFreshnessNotice source={loaderData.source} builtAt={loaderData.builtAt} />
        <h1 className="sr-only">Osmosis Alloyed Assets</h1>
        <OverviewChart pools={pools} />
        <div className="flex w-full flex-col gap-2 overflow-auto">
          {pools.map((pool) => (
            <PoolCard key={pool.id} pool={pool} />
          ))}
        </div>
      </div>
    </main>
  )
}
