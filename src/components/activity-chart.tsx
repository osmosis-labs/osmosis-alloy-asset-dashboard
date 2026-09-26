"use client"

import { POOL_STATUS } from "@/constants/status"
import type { PoolActivity } from "@/services/pool"
import { Loader2, Snowflake } from "lucide-react"
import useSWR from "swr"

import { PoolOverview } from "@/types/pool"
import { ACTIVITY_MAX_SWAPS, ACTIVITY_RANGE_DAYS } from "@/lib/activity"
import dayjs from "@/lib/dayjs"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DateRangeSelect, useDateRange } from "@/components/date-range"

import { ActivityChartContent } from "./activity-chart-context"
import { isFrozen, poolTileClass } from "./status-badges"

const DAY_MS = 24 * 60 * 60 * 1000

// Same box as the chart so the card does not jump while loading or on error.
const Message = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-[300px] w-full items-center justify-center">
    {children}
  </div>
)

const fetchActivity = async (url: string): Promise<PoolActivity> => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`activity ${res.status}`)
  return res.json()
}

const ActivityChart = ({ pool }: { pool: PoolOverview }) => {
  const frozen = isFrozen(pool.status)
  const { range, setRange } = useDateRange()
  // Client-fetched, so AutoRefresh's router.refresh() does not reach it: poll
  // on the same 5-minute cadence as the store's cache. Frozen pools are still
  // fetched: a pool frozen today has swaps from before the freeze in longer
  // ranges.
  const { data, error, isLoading } = useSWR(
    `/api/pools/${pool.id}/activity?range=${range}`,
    fetchActivity,
    {
      keepPreviousData: true,
      revalidateOnFocus: false,
      refreshInterval: 5 * 60 * 1000,
    }
  )

  const days = ACTIVITY_RANGE_DAYS[range]
  const historyShort =
    data?.source === "store" &&
    !!data.coveredFrom &&
    (days === null ||
      new Date(data.coveredFrom).getTime() > Date.now() - days * DAY_MS)

  return (
    <Card className={cn("w-full", poolTileClass(pool.status))}>
      <CardHeader className="flex items-center justify-between gap-2 md:flex-row">
        <div className="grid flex-1 gap-1 text-center sm:text-left">
          <CardTitle>Pool Asset Activity</CardTitle>
          <CardDescription>
            Net change in each variant&apos;s reserve per period, from every
            swap since the pool launched. Above zero: more entered the pool than
            left.
          </CardDescription>
        </div>
        <DateRangeSelect range={range} setRange={setRange} />
      </CardHeader>
      <CardContent className="relative">
        {frozen && (
          // The pool rejects every swap now, so there is no new activity;
          // earlier activity in the selected range is still shown below.
          <div className="mb-3 flex items-start gap-2 rounded-md border border-sky-500/40 bg-sky-500/10 p-2 text-left text-sm">
            <Snowflake className="mt-0.5 size-4 shrink-0 text-sky-500 dark:text-sky-300" />
            <p>
              <span className="font-semibold">{POOL_STATUS.frozen.title}.</span>{" "}
              <span className="text-muted-foreground">
                {POOL_STATUS.frozen.description} Activity from before the freeze
                is shown for the selected range.
              </span>
            </p>
          </div>
        )}
        {error && !data ? (
          <Message>
            <p className="text-muted-foreground">
              Unable to load asset activity
            </p>
          </Message>
        ) : !data || isLoading ? (
          <Message>
            <Loader2 className="size-8 animate-spin" />
          </Message>
        ) : (
          <>
            {data.activities.length === 0 && (
              <div className="absolute left-0 right-0 top-1/3 m-auto text-center">
                <p className="text-muted-foreground">
                  {frozen
                    ? "No swaps in this range. The pool is frozen."
                    : "No asset activity"}
                </p>
              </div>
            )}
            <ActivityChartContent
              activities={data.activities}
              className="h-[300px]"
              pool={pool}
            />
            {data.source === "live" && data.activities.length > 0 && (
              // Without the activity store only the latest swaps are fetched,
              // so a busy pool's chart covers just its last few hours.
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Showing the {ACTIVITY_MAX_SWAPS.toLocaleString("en-US")} most
                recent swaps
              </p>
            )}
            {historyShort && (
              <p className="mt-2 text-center text-xs text-muted-foreground">
                History available since{" "}
                {dayjs(data.coveredFrom).format("MMM D, YYYY")}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
ActivityChart.displayName = "ActivityChart"

export { ActivityChart }
