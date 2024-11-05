"use client"

import { useMemo, useState } from "react"
import dayjs from "dayjs"
import _ from "lodash"
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts"

import { PoolOverview } from "@/types/pool"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const PERIOD_OPTIONS = ["7", "30", "60", "90"] as const

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
  const [selectedPeriod, setSelectedPeriod] = useState<string>(
    PERIOD_OPTIONS[2]
  )

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="flex items-center justify-between gap-2 md:flex-row">
        <div className="grid flex-1 gap-1 text-center sm:text-left">
          <CardTitle>{title || "Liquidity Overview"}</CardTitle>
          <CardDescription>
            {description || "Showing Liquidity For All Pools"}
          </CardDescription>
        </div>
        <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
          <SelectTrigger
            className="w-[160px] rounded-lg sm:ml-auto"
            aria-label="Select a value"
          >
            <SelectValue>{selectedPeriod} Days</SelectValue>
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {PERIOD_OPTIONS.map((v) => (
              <SelectItem key={v} value={v} className="rounded-lg">
                {v} Days
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <OverviewChartContent
          pools={pools}
          period={selectedPeriod}
          className="h-[250px]"
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
              pool.alloy.asset.images.at(1)?.theme?.primary_color_hex ||
              pool.alloy.asset.images.at(0)?.theme?.primary_color_hex ||
              `hsl(var(--chart-${idx})`,
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
        <ChartLegend content={<ChartLegendContent />} />
      </AreaChart>
    </ChartContainer>
  )
}
OverviewChartContent.displayName = "OverviewChartContent"

export { OverviewChart, OverviewChartContent }
