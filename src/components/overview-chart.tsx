"use client"

import { useMemo } from "react"
import dayjs from "dayjs"
import _ from "lodash"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { PoolOverview } from "@/types/pool"
import { NumberFormatter } from "@/lib/number"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  dateRangeDays,
  DateRangeSelect,
  useDateRange,
} from "@/components/date-range"

// Hardcoded color mappings for alloy assets by pool ID. Add more pool IDs and their hex colors as needed
const POOL_COLORS: Record<string, string> = {
  "1868": "#F7931A", // Bitcoin - Orange (official)
  "1878": "#627EEA", // Ethereum - Purple/Blue (commonly used, visible on dark backgrounds)
  "1925": "#9945FF", // Solana - Purple (official)
  "1816": "#009393", // Tether - Aqua (official)
  "2434": "#00A5DF", // Ripple - Light Blue
  "2242": "#C8A014", // Dogecoin - Gold
}

const OverviewChart = ({
  pools,
  title,
  description,
  className,
}: {
  pools: PoolOverview[]
  title?: string
  description?: string
  className?: string
}) => {
  // Shared with the other charts on the pool page; the home page (no
  // provider) keeps its own range, defaulting to a year as before.
  const { range, setRange } = useDateRange("1y")

  return (
    // Flex column so the chart fills the card when the grid row is taller
    // than its content (e.g. next to the Asset Sources card).
    <Card className={cn("flex w-full flex-col", className)}>
      <CardHeader className="flex items-center justify-between gap-2 md:flex-row">
        <div className="grid flex-1 gap-1 text-center sm:text-left">
          <CardTitle>{title || "Liquidity Overview"}</CardTitle>
          <CardDescription>
            {description || "Showing Liquidity For All Pools"}
          </CardDescription>
        </div>
        <DateRangeSelect range={range} setRange={setRange} />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <OverviewChartContent
          pools={pools}
          period={dateRangeDays(range) ?? undefined}
          className="h-full min-h-[250px] flex-1"
        />
      </CardContent>
    </Card>
  )
}
OverviewChart.displayName = "OverviewChart"

const OverviewChartContent = ({
  pools,
  period,
  className,
}: {
  pools: PoolOverview[]
  period?: string | number
  className?: string
}) => {
  const { data, config } = useMemo(() => {
    const now = dayjs()
    const data = _.chain(pools)
      .map((pool) =>
        pool.liquidityChart.map((d) => ({
          ...d,
          key: pool.id,
          value: Math.floor(d.value),
        }))
      )
      .flatten()
      .groupBy("time")
      .map((v, k) => ({
        ..._.fromPairs(v.map((d) => [d.key, d.value])),
        date: dayjs(k).format("MMMM DD, YYYY"),
      }))
      .sortBy((d) => dayjs(d.date).unix())
      .value()

    // Find first non-zero value index
    const firstNonZeroIndex = data.findIndex((d) => {
      const poolKeys = _.keys(d).filter((k) => k !== "date")
      return poolKeys.some((key) => (d as any)[key] > 0)
    })

    // Remove all data points before first non-zero value
    if (firstNonZeroIndex > 0) {
      data.splice(0, firstNonZeroIndex)
    }

    if (period) {
      const cutoffAfterIndex = data.findIndex(
        (d) => now.diff(dayjs(d.date), "days") <= Number(period)
      )

      if (cutoffAfterIndex > 0) {
        data.splice(0, cutoffAfterIndex)
      }
    }

    const config = _.chain(pools)
      .map((pool) => {
        // get random chart color index using pool id as seed
        const idx = _.range(1, 6)[Number(pool.id) % 5]
        return [
          pool.id,
          {
            label: pool.alloy.asset.name,
            color:
              POOL_COLORS[pool.id] ||
              pool.alloy.asset.images?.at(1)?.theme?.primary_color_hex ||
              pool.alloy.asset.images?.at(0)?.theme?.primary_color_hex ||
              `hsl(var(--chart-${idx}))`,
          },
        ]
      })
      .fromPairs()
      .value() satisfies ChartConfig

    return {
      data,
      config,
    }
  }, [pools, period])

  return (
    <ChartContainer
      className={cn("aspect-auto w-full", className)}
      config={config}
    >
      <AreaChart data={data}>
        <defs>
          {_.chain(config)
            .map((v, k) => (
              <linearGradient
                key={k}
                id={`color-${k}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="5%" stopColor={v.color} stopOpacity={0.8} />
                <stop offset="95%" stopColor={v.color} stopOpacity={0.1} />
              </linearGradient>
            ))
            .value()}
        </defs>
        {_.chain(config)
          .map((v, k) => (
            <Area
              key={k}
              dataKey={k}
              type="monotone"
              stroke={v.color}
              strokeWidth={2}
              dot={false}
              fill={`url( #color-${k} )`}
            />
          ))
          .value()}
        <CartesianGrid vertical={false} />
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent isDollar />}
        />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(value) => {
            const date = new Date(value)
            return date.toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })
          }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={(v) => `$${NumberFormatter.formatCompact(v)}`}
        />
        {/* A single pool (pool page, pool cards) needs no legend. */}
        {pools.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
      </AreaChart>
    </ChartContainer>
  )
}
OverviewChartContent.displayName = "OverviewChartContent"

export { OverviewChart, OverviewChartContent }
