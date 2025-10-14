import { Suspense } from "react"
import { getPoolInOutAssets } from "@/services/pool"
import { Loader2 } from "lucide-react"

import { PoolOverview } from "@/types/pool"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { ActivityChartContent } from "./activity-chart-context"

const ActivityChart = ({ pool }: { pool: PoolOverview }) => {
  return (
    <Card className="w-full">
      <CardHeader className="flex items-center justify-between gap-2 md:flex-row">
        <div className="grid flex-1 gap-1 text-center sm:text-left">
          <CardTitle>Pool Asset Acitvity</CardTitle>
          <CardDescription>
            Asset inflow, outflow, and interaction count
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="relative">
        <Suspense
          fallback={
            <div className="flex h-[300px] w-full items-center justify-center">
              <Loader2 className="size-8 animate-spin" />
            </div>
          }
        >
          <SuspensedActivityChart pool={pool} className="h-[300px]" />
        </Suspense>
      </CardContent>
    </Card>
  )
}
ActivityChart.displayName = "ActivityChart"

const SuspensedActivityChart = async ({
  pool,
  className,
}: {
  pool: PoolOverview
  className?: string
}) => {
  let activities: Awaited<ReturnType<typeof getPoolInOutAssets>> = []

  try {
    activities = await getPoolInOutAssets(pool.id)
  } catch (error) {
    console.error(`Failed to fetch activities for pool ${pool.id}:`, error)
    // Return empty activity state on error
    return (
      <div className="absolute left-0 right-0 top-1/3 m-auto">
        <p className="text-muted-foreground">Unable to load asset activity</p>
      </div>
    )
  }

  return (
    <>
      {activities.length === 0 && (
        <div className="absolute left-0 right-0 top-1/3 m-auto">
          <p className="text-muted-foreground">No asset activity</p>
        </div>
      )}
      <ActivityChartContent
        activities={activities}
        className={className}
        pool={pool}
      />
    </>
  )
}

export { ActivityChart }
