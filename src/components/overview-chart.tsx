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
  isSafeChartColor,
} from "@/components/ui/chart"
import {
  dateRangeDays,
  DateRangeSelect,
  useDateRange,
} from "@/components/date-range"

// Brand colors for alloy assets by pool ID, mostly taken from each asset's
// logo. The assetlists carry no theme colors for these assets, so without an
// entry here an alloy falls back to the generic chart palette. Add a new
// alloy here when it is listed.
const POOL_COLORS: Record<string, string> = {
  "1868": "#F7931A", // Bitcoin - Orange (official)
  "1878": "#627EEA", // Ethereum - Purple/Blue (commonly used, visible on dark backgrounds)
  "1925": "#9945FF", // Solana - Purple (official)
  "1816": "#009393", // Tether - Aqua (official)
  "2434": "#00A5DF", // Ripple - Light Blue
  "2242": "#C2A633", // Dogecoin - Gold (official)
  "3497": "#2775CA", // USDC - Blue (logo)
  "2676": "#F0B90B", // BNB - Yellow (logo)
  "2709": "#6966FF", // dYdX - Purple (logo)
  "1970": "#4B9440", // Pepe - Green (logo)
  "2710": "#D4497F", // Fetch.ai - Pink (the logo is monochrome)
}

const OverviewChart = ({
  pools,
  title,
  description,
  className,
  fillHeight = false,
}: {
  pools: PoolOverview[]
  title?: string
  description?: string
  className?: string
  // Grow the chart to fill the card when a grid row makes the card taller
  // than its content (pool page, next to Asset Sources). Only from md up:
  // below that the grid is one column, the card has no set height, and a
  // percentage height would collapse the chart to nothing.
  fillHeight?: boolean
}) => {
  // Shared with the other charts on the pool page; the home page (no
  // provider) keeps its own range, defaulting to a year as before.
  const { range, setRange } = useDateRange("1y")

  return (
    <Card className={cn("flex w-full flex-col", className)}>
      <CardHeader className="flex items-center justify-between gap-2 md:flex-row">
        <div className="grid flex-1 gap-1 text-center sm:text-left">
          <CardTitle>{title || "Liquidity Overview"}</CardTitle>
          <CardDescription>
            {description || "Historical liquidity of all alloyed pools in USD"}
          </CardDescription>
        </div>
        <DateRangeSelect range={range} setRange={setRange} />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <OverviewChartContent
          pools={pools}
          label={`${title || "Liquidity overview"}: ${
            description || "historical liquidity of all alloyed pools in USD"
          }`}
          period={dateRangeDays(range) ?? undefined}
          className={
            fillHeight ? "h-[250px] md:h-full md:min-h-[250px]" : "h-[250px]"
          }
        />
      </CardContent>
    </Card>
  )
}
OverviewChart.displayName = "OverviewChart"

const OverviewChartContent = ({
  pools,
  label,
  period,
  className,
}: {
  pools: PoolOverview[]
  // What the chart shows, for assistive technology (it is drawn as an image).
  label: string
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

    // Assetlist theme colors are third-party data: use them only when they
    // are plain colors.
    const ownColor = (pool: PoolOverview) =>
      POOL_COLORS[pool.id] ||
      [1, 0]
        .map((i) => pool.alloy.asset.images?.at(i)?.theme?.primary_color_hex)
        .find(isSafeChartColor)

    // Pools without their own color take the palette colors in turn, so two
    // of them never share one (a pool-id modulo could).
    const paletteIds = _.sortBy(
      pools.filter((pool) => !ownColor(pool)).map((pool) => pool.id),
      Number
    )

    const config = _.chain(pools)
      .map((pool) => [
        pool.id,
        {
          label: pool.alloy.asset.name,
          color:
            ownColor(pool) ||
            `hsl(var(--chart-${(paletteIds.indexOf(pool.id) % 5) + 1}))`,
        },
      ])
      .fromPairs()
      .value() satisfies ChartConfig

    return {
      data,
      config,
    }
  }, [pools, period])
  const showsYears = period === undefined || Number(period) > 90

  return (
    <ChartContainer
      className={cn("aspect-auto w-full", className)}
      config={config}
      role="img"
      aria-label={label}
    >
      <AreaChart data={data} accessibilityLayer>
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
          // Past about three months the ticks span years, so they show the
          // month and year instead of the day.
          tickFormatter={(value) => {
            const date = new Date(value)
            return date.toLocaleDateString(
              "en-US",
              showsYears
                ? { month: "short", year: "2-digit" }
                : { month: "short", day: "numeric" }
            )
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
