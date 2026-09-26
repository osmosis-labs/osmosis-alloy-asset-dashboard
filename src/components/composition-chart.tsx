"use client"

import { useMemo, useState } from "react"
import type { PoolComposition } from "@/services/composition"
import _ from "lodash"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"

import { PoolOverview } from "@/types/pool"
import dayjs from "@/lib/dayjs"
import { NumberFormatter } from "@/lib/number"
import {
  getPoolSources,
  getVariantStyles,
  reserveAmount,
  SOURCE_GROUPINGS,
  sourceColor,
  SourceGrouping,
  variantDenom,
} from "@/lib/pool-sources"
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  dateRangeDays,
  DateRangeSelect,
  useDateRange,
} from "@/components/date-range"
import { DecimalSpan } from "@/components/decimal-span"

type Scale = "share" | "amount"

// How the pool's backing has shifted over time, from daily reserve snapshots
// plus a final point from the page's current reserves. Grouped like the Asset
// Sources pie (Variant / Provider / Origin) with the same colors.
const CompositionChart = ({
  pool,
  composition,
  className,
}: {
  pool: PoolOverview
  composition: PoolComposition
  className?: string
}) => {
  const [grouping, setGrouping] = useState<SourceGrouping>("issuer")
  const [scale, setScale] = useState<Scale>("share")
  const { range, setRange } = useDateRange()

  const { data, config, keys } = useMemo(() => {
    const byDenom = _.keyBy(composition.denoms, "denom")
    // Current variants may be missing from old snapshots and vice versa, so
    // labels come from both the history and the live pool.
    for (const coin of pool.reserveCoins) {
      const denom = variantDenom(coin)
      if (denom && !byDenom[denom]) {
        byDenom[denom] = {
          denom,
          symbol: coin.currency?.currency?.coinDenom ?? denom,
          issuer: coin.provenance?.issuer ?? null,
          origin: coin.provenance?.origin ?? null,
        }
      }
    }
    const groupOf = (denom: string) => {
      const d = byDenom[denom]
      if (grouping === "variant") return d?.symbol ?? denom
      if (grouping === "issuer") return d?.issuer ?? "Unknown"
      return d?.origin ?? "Unknown"
    }

    // Final point: the pool's current reserves.
    const now = {
      time: Date.now(),
      values: _.fromPairs(
        pool.reserveCoins.map((c) => [
          variantDenom(c) ?? "",
          reserveAmount(c.currency),
        ])
      ),
    }
    const days = dateRangeDays(range)
    const from = days === null ? -Infinity : Date.now() - days * 86_400_000
    const points = [...composition.points.filter((p) => p.time >= from), now]

    const rows = points.map((p) => {
      const row: Record<string, number> = { time: p.time }
      for (const [denom, value] of Object.entries(p.values)) {
        const key = groupOf(denom)
        row[key] = (row[key] ?? 0) + value
      }
      return row
    })

    // Group order and colors: current groups in the Asset Sources pie's order
    // (so a group keeps its color across both charts), then groups that only
    // exist in the history.
    const current = getPoolSources(pool, grouping).map((g) => g.label)
    const historical = _.chain(rows)
      .flatMap((r) => Object.keys(r))
      .uniq()
      .filter((k) => k !== "time" && !current.includes(k))
      .value()
    const keys = [...current, ...historical]
    const variantStyles = getVariantStyles(pool)
    const colorFor = (key: string, i: number) => {
      if (grouping === "variant") {
        const denom = _.findKey(byDenom, (d) => d.symbol === key)
        if (denom && variantStyles[denom]) return variantStyles[denom].color
      }
      return sourceColor(i)
    }
    const config = _.fromPairs(
      keys.map((k, i) => [k, { label: k, color: colorFor(k, i) }])
    ) satisfies ChartConfig

    // Zero-fill so every stack has every series (recharts skips missing keys).
    const data = rows.map((r) => ({
      ..._.fromPairs(keys.map((k) => [k, 0])),
      ...r,
    }))
    return { data, config, keys }
  }, [composition, pool, grouping, range])

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center">
        <div className="grid flex-1 gap-1 text-center md:text-left">
          <CardTitle>Backing Over Time</CardTitle>
          <CardDescription>
            {scale === "share"
              ? "Share of the pool's reserves by "
              : "Pool reserves (in the alloy's unit) by "}
            {SOURCE_GROUPINGS.find(
              (g) => g.value === grouping
            )?.label.toLowerCase()}{" "}
            over time
          </CardDescription>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <DateRangeSelect range={range} setRange={setRange} />
          <Tabs value={scale} onValueChange={(v) => setScale(v as Scale)}>
            <TabsList className="h-8">
              <TabsTrigger value="share" className="text-xs">
                Share
              </TabsTrigger>
              <TabsTrigger value="amount" className="text-xs">
                Amount
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs
            value={grouping}
            onValueChange={(v) => setGrouping(v as SourceGrouping)}
          >
            <TabsList className="h-8">
              {SOURCE_GROUPINGS.map((g) => (
                <TabsTrigger key={g.value} value={g.value} className="text-xs">
                  {g.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer
          className="aspect-auto h-[300px] w-full"
          config={config}
        >
          <AreaChart
            data={data}
            stackOffset={scale === "share" ? "expand" : "none"}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="time"
              type="number"
              scale="time"
              domain={["dataMin", "dataMax"]}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(v) =>
                dayjs(v).format(dateRangeDays(range) === 1 ? "HH:mm" : "MMM D")
              }
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={48}
              tickFormatter={(v) =>
                scale === "share"
                  ? `${Math.round(v * 100)}%`
                  : NumberFormatter.formatCompact(v)
              }
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_label, payload) => {
                    const time = payload?.[0]?.payload?.time
                    // Hourly snapshots cover the last week, so short ranges
                    // show the time too.
                    const days = dateRangeDays(range)
                    const format =
                      days !== null && days <= 7
                        ? "MMM D, YYYY HH:mm"
                        : "MMM D, YYYY"
                    return time ? dayjs(time).format(format) : ""
                  }}
                  valueFormatter={(v: number) => (
                    <DecimalSpan mantissa={2}>{v}</DecimalSpan>
                  )}
                />
              }
            />
            {keys.map((k) => (
              <Area
                key={k}
                dataKey={k}
                type="monotone"
                stackId="backing"
                stroke={config[k].color}
                fill={config[k].color}
                fillOpacity={0.6}
                dot={false}
                isAnimationActive={false}
              />
            ))}
            <ChartLegend
              content={<ChartLegendContent />}
              className="flex-wrap gap-y-1"
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
CompositionChart.displayName = "CompositionChart"

export { CompositionChart }
