import { getPoolsOverview } from "@/services/pool"

import { OverviewChart } from "../components/overview-chart"
import { PoolCard } from "../components/pool-card"

// Pool activity is read from the Postgres store (refreshed by the 15-minute
// cron), so pages can rebuild often without adding LCD load.
export const revalidate = 300 // 5 minutes
// ISR regenerations and the unstable_cache refreshes behind them run inside
// this function. Vercel's 15s default kills the pools build mid-fetch, so
// the cached overview is never replaced and the page freezes on old data.
export const maxDuration = 60

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
