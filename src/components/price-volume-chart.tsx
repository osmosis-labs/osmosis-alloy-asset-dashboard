"use client"

import { useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"
import useSWRImmutable from "swr/immutable"

import dayjs from "@/lib/dayjs"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { PriceVolume, Timeframe, TIMEFRAMES } from "../lib/timeframe"
import { getPriceVolumeChart } from "./query"

const PriceVolumeChart = ({ denom }: { denom: string }) => {
  const [timeframe, setTimeframe] = useState<Timeframe>("7 Days")
  const data = useSWRImmutable(
    ["price-volume", denom, timeframe],
    async ([, denom, timeframe]) => getPriceVolumeChart(denom, timeframe)
  )

  return (
    <Card className="w-full">
      <CardHeader className="flex items-center justify-between gap-2 md:flex-row">
        <div className="grid flex-1 gap-1 text-center sm:text-left">
          <CardTitle>Alloy Asset Volume And Price</CardTitle>
          <CardDescription>
            Alloy asset volume in $USD and price over time
          </CardDescription>
        </div>
        <Select
          value={timeframe}
          onValueChange={(tf) => setTimeframe(tf as Timeframe)}
        >
          <SelectTrigger
            className="w-[160px] rounded-lg sm:ml-auto"
            aria-label="Select a value"
          >
            <SelectValue>{timeframe}</SelectValue>
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {TIMEFRAMES.map((v) => (
              <SelectItem key={v} value={v} className="rounded-lg">
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="relative h-[300px] w-full">
        {data.isValidating ? (
          <Loader2 className="absolute left-0 right-0 top-1/3 m-auto size-8 animate-spin" />
        ) : !data.data || !data.data.length ? (
          <div className="absolute left-0 right-0 top-1/3 m-auto">
            <p className="text-muted-foreground">No asset activity</p>
          </div>
        ) : (
          <PriceVolumeChartContent data={data.data} className="h-[300px]" />
        )}
      </CardContent>
    </Card>
  )
}
PriceVolumeChart.displayName = "PriceVolumeChart"

const config = {
  volume: {
    label: "Volume",
    color: "hsl(var(--primary))",
  },
  average: {
    label: "Mid-Price",
    color: "hsl(var(--chart-1))",
  },
  "highLow[0]": {
    label: "High",
    color: "hsl(var(--chart-2))",
  },
  "highLow[1]": {
    label: "Low",
    color: "hsl(var(--chart-5))",
  },
} as ChartConfig

// Fit the price axis to the data's own range. Padding by a share of the price
// (the old +-5%) flattened a stablecoin trading 0.998-1.001 into a line on a
// 0.95-1.05 axis. Pad by 10% of the range instead, with a small floor so a
// flat series still gets an axis, and give labels enough decimals to tell
// adjacent ticks apart (0.999 vs 1.000).
const getPriceAxis = (data: PriceVolume[]) => {
  const values = data
    .flatMap((d) => [d.highLow[0], d.highLow[1], d.average])
    .filter((v) => Number.isFinite(v))
  if (values.length === 0) {
    return {
      priceDomain: ["auto", "auto"] as [string, string],
      priceDecimals: 2,
    }
  }
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = Math.max((max - min) * 0.1, Math.abs(max) * 0.0005)
  const lower = Math.max(min - pad, 0)
  const upper = max + pad
  // Recharts draws ~5 ticks; decimals follow the tick step, clamped to 0-8.
  const step = (upper - lower) / 4
  const priceDecimals = Math.min(Math.max(Math.ceil(-Math.log10(step)), 0), 8)
  return {
    priceDomain: [lower, upper] as [number, number],
    priceDecimals,
  }
}

const PriceVolumeChartContent = ({
  data,
  className,
}: {
  data: PriceVolume[]
  className?: string
}) => {
  const { priceDomain, priceDecimals } = useMemo(
    () => getPriceAxis(data),
    [data]
  )

  return (
    <ChartContainer
      className={cn("aspect-auto w-full", className)}
      config={config}
    >
      <ComposedChart data={data}>
        <CartesianGrid vertical={false} />
        <ChartLegend
          content={<ChartLegendContent />}
          className="flex-wrap gap-y-1"
        />
        <ChartTooltip
          content={<ChartTooltipContent isDollar />}
          labelFormatter={(_, pl) => {
            if (!pl[0]?.payload?.time) return ""
            return dayjs(pl[0]?.payload?.time * 1000).format("ddd D, HH:mm")
          }}
        />
        <XAxis
          dataKey="time"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={48}
          tickFormatter={(value) => {
            return dayjs(value * 1000).format("ddd D, HH:mm")
          }}
        />
        <YAxis
          yAxisId={1}
          orientation="right"
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(v) => `$${NumberFormatter.formatCompact(v)}`}
        />
        <YAxis
          yAxisId={2}
          tickLine={false}
          axisLine={false}
          width={64}
          domain={priceDomain}
          allowDataOverflow
          tickFormatter={(v: number) =>
            `$${v.toLocaleString("en-US", {
              minimumFractionDigits: priceDecimals,
              maximumFractionDigits: priceDecimals,
            })}`
          }
        />
        <Bar
          type="monotone"
          dataKey="volume"
          fill="hsl(var(--chart-1))"
          yAxisId={1}
          radius={4}
        />
        <Line
          type="monotone"
          dataKey="highLow[0]"
          stroke="hsl(var(--chart-2))"
          dot={false}
          strokeWidth={2}
          yAxisId={2}
        ></Line>
        <Line
          type="monotone"
          dataKey="highLow[1]"
          stroke="hsl(var(--chart-5))"
          dot={false}
          strokeWidth={2}
          yAxisId={2}
        />
        <Line
          type="monotone"
          dataKey="average"
          stroke="hsl(var(--primary))"
          dot={false}
          strokeWidth={2}
          yAxisId={2}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
PriceVolumeChartContent.displayName = "PriceVolumeChartContent"

export { PriceVolumeChart }
