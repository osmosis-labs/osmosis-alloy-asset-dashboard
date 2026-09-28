import Link from "next/link"
import { getPoolsOverview, isMigrationPool } from "@/services/pool"

import { siteConfig } from "@/config/site"
import { DataFreshnessNotice } from "@/components/data-freshness"

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
  const overview = await getPoolsOverview()
  // Migration alloys are listed on /pools, not here.
  const pools = overview.pools.filter((pool) => !isMigrationPool(pool))

  return (
    <main className="flex items-center justify-center">
      <div className="container my-6 flex flex-col items-center gap-6 text-center">
        <DataFreshnessNotice {...overview} />
        <div className="w-full space-y-1">
          <h1 className="text-3xl font-bold">Osmosis Alloyed Assets</h1>
          <p className="text-muted-foreground">
            Each alloyed asset is one token backed 1:1 by several bridged
            versions of the same asset. See what backs each one and how it
            changes.{" "}
            <Link
              href={siteConfig.links.docs}
              className="font-medium text-foreground underline underline-offset-4"
            >
              Learn more
            </Link>
          </p>
        </div>
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
