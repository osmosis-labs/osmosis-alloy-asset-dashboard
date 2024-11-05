import { getPoolsOverview } from "@/services/pool"

import { OverviewChart } from "./overview-chart"
import { PoolCard } from "./pool-card"

export const runtime = "edge"
export const revalidate = 3600 // 1 hour

export default async function Home() {
  const { pools } = await getPoolsOverview()

  return (
    <main className="flex items-center justify-center">
      <div className="container my-6 flex flex-col items-center gap-6 text-center">
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
