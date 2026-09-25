import { Suspense } from "react"
import { POOL_STATUS } from "@/constants/status"
import { ACTIVITY_MAX_SWAPS, getPoolInOutAssets } from "@/services/pool"
import { Loader2, Snowflake } from "lucide-react"

import { PoolOverview } from "@/types/pool"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { ActivityChartContent } from "./activity-chart-context"
import { isFrozen, poolTileClass } from "./status-badges"

const ActivityChart = ({ pool }: { pool: PoolOverview }) => {
  const frozen = isFrozen(pool.status)
  return (
    <Card className={cn("w-full", poolTileClass(pool.status))}>
      <CardHeader className="flex items-center justify-between gap-2 md:flex-row">
        <div className="grid flex-1 gap-1 text-center sm:text-left">
          <CardTitle>Pool Asset Activity</CardTitle>
          <CardDescription>
            Net change in each variant&apos;s reserve (above zero: more entered
            the pool than left) over the last 24 hours, up to the{" "}
            {ACTIVITY_MAX_SWAPS.toLocaleString("en-US")} most recent swaps
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="relative">
        {frozen ? (
          // A frozen pool rejects every swap, so its reserves cannot move:
          // say so instead of drawing an empty chart, and skip the LCD fetch.
          <div className="flex h-[300px] w-full flex-col items-center justify-center gap-2 text-center">
            <Snowflake className="size-8 text-sky-500 dark:text-sky-300" />
            <p className="font-semibold">{POOL_STATUS.frozen.title}</p>
            <p className="max-w-md text-sm text-muted-foreground">
              {POOL_STATUS.frozen.description} Its reserves do not change while
              frozen, so there is no activity to show.
            </p>
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="flex h-[300px] w-full items-center justify-center">
                <Loader2 className="size-8 animate-spin" />
              </div>
            }
          >
            <SuspensedActivityChart pool={pool} className="h-[300px]" />
          </Suspense>
        )}
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
    // No chart is rendered on error, so the message needs its own height
    // (same box as the loading fallback) or it collapses onto the card edge.
    return (
      <div className="flex h-[300px] w-full items-center justify-center">
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
