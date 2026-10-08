import { getPoolsOverview, isMigrationPool } from "@/services/pool"
import _ from "lodash"

import { PoolOverview } from "@/types/pool"
import { DataFreshnessNotice } from "@/components/data-freshness"
import { SupportedPoolsTable } from "@/components/supported-pools-table"
import { UnsupportedPoolsTable } from "@/components/unsupported-pools-table"

import { cachedPageHeaders, pageMeta } from "../meta"
import type { Route } from "./+types/pools"

export const meta: Route.MetaFunction = () =>
  pageMeta({
    title: "All Pools",
    description:
      "Every Osmosis alloyed asset pool: the alloys, the migration alloys, and the pools the dashboard does not track.",
    path: "/pools",
  })

export const headers: Route.HeadersFunction = ({ errorHeaders }) =>
  cachedPageHeaders({ errorHeaders })

// The tables never draw the liquidity history; leaving it out keeps it out of
// the serialized loader data (it was most of a ~2MB page).
const tableRow = (pool: PoolOverview): PoolOverview => ({
  ...pool,
  liquidityChart: [],
})

export async function loader() {
  const overview = await getPoolsOverview()
  const [migrationPools, alloyPools] = _.partition(overview.pools, isMigrationPool)
  return {
    source: overview.source,
    builtAt: overview.builtAt,
    alloyPools: alloyPools.map(tableRow),
    migrationPools: migrationPools.map(tableRow),
    unsupportedPools: overview.unsupportedPools,
  }
}

export default function Pools({ loaderData }: Route.ComponentProps) {
  const { alloyPools, migrationPools, unsupportedPools } = loaderData

  return (
    <main className="container my-6 flex flex-col gap-6">
      <DataFreshnessNotice source={loaderData.source} builtAt={loaderData.builtAt} />
      <h1 className="text-4xl font-bold">Pools</h1>
      <h2 className="text-2xl font-semibold">Alloyed Assets</h2>
      <div className="rounded-md border">
        <SupportedPoolsTable pools={alloyPools} />
      </div>

      {migrationPools.length > 0 && (
        <>
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold">Migration Alloys</h2>
            <p className="text-muted-foreground">
              Pools that convert a legacy token into its replacement 1:1, such
              as STARS.og to STARS. They exist for the migration and are not
              alloyed assets in their own right.
            </p>
          </div>
          <div className="rounded-md border">
            <SupportedPoolsTable pools={migrationPools} />
          </div>
        </>
      )}

      <div className="space-y-1">
        <h2 className="text-2xl font-semibold">Not Tracked</h2>
        <p className="text-muted-foreground">
          Alloys with less than $10,000 of liquidity, and pools whose alloyed
          asset is not in the Osmosis assetlist.
        </p>
      </div>
      <div className="rounded-md border">
        <UnsupportedPoolsTable pools={unsupportedPools} />
      </div>
    </main>
  )
}
