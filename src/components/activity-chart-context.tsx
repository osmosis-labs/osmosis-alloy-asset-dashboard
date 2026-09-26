"use client"

import { useMemo } from "react"
import type { DenomMeta } from "@/services/denom-meta"
import { BigNumber } from "bignumber.js"
import _ from "lodash"
import { LogIn, LogOut } from "lucide-react"
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import { PoolInOutAssets, PoolOverview } from "@/types/pool"
import dayjs from "@/lib/dayjs"
import { NumberFormatter } from "@/lib/number"
import {
  getVariantStyles,
  variantColor,
  variantDenom,
  variantSymbol,
} from "@/lib/pool-sources"
import { cn } from "@/lib/utils"
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  getPayloadConfigFromPayload,
} from "@/components/ui/chart"
import { DecimalSpan } from "@/components/decimal-span"

// Base amounts to display units. Denoms without known decimals are dropped:
// showing them as zero would hide real flow.
const toDisplay = (
  amounts: Record<string, string>,
  decimals: _.Dictionary<number>
) =>
  _.chain(amounts)
    .pickBy((_v, denom) => decimals[denom] !== undefined)
    .mapValues((v, denom) =>
      new BigNumber(v).shiftedBy(-decimals[denom]).toNumber()
    )
    .value()

const ActivityChartContent = ({
  activities,
  denoms,
  className,
  pool,
}: {
  activities: PoolInOutAssets[]
  // Symbol and decimals for denoms in the activity (from the API), covering
  // variants no longer in the pool's current reserves.
  denoms: Record<string, DenomMeta>
  pool: PoolOverview
  className?: string
}) => {
  // One net-flow series per variant: positive when more of it entered the
  // pool than left in the bucket, negative when it drained, i.e. the change in
  // the pool's reserve of that variant. A transmuter swap moves one variant in
  // and another out, so this shows which way the pool is being rebalanced.
  // The alloy token is not a reserve (the transmuter mints it on the way out
  // and burns it on the way in), so it has no series here. Variants are
  // labelled with the frontend symbol and colored like their source in the
  // Asset Sources chart. Variants that appear in the activity but are no
  // longer in the current reserves (drained to zero, or removed) follow the
  // current ones, with the next palette colors.
  const historicalDenoms = useMemo(() => {
    const current = new Set(
      _.compact([
        ...pool.reserveCoins.map((c) => variantDenom(c)),
        pool.alloy.asset?.base,
      ])
    )
    return _.chain(activities)
      .flatMap((a) => [..._.keys(a.in), ..._.keys(a.out)])
      .uniq()
      .filter((d) => !current.has(d) && !!denoms[d])
      .sortBy((d) => denoms[d].symbol)
      .value()
  }, [activities, denoms, pool])

  const config = useMemo(() => {
    const variantStyles = getVariantStyles(pool)
    const currentSeries = pool.reserveCoins.map((coin) => {
      const denom = variantDenom(coin) ?? ""
      return [
        `net.${denom}`,
        {
          label: variantStyles[denom]?.symbol ?? variantSymbol(coin),
          symbol: variantStyles[denom]?.symbol ?? variantSymbol(coin),
          color: variantStyles[denom]?.color ?? "hsl(var(--chart-1))",
          stackId: "net",
        },
      ]
    })
    const historicalSeries = historicalDenoms.map((denom, i) => [
      `net.${denom}`,
      {
        label: denoms[denom].symbol,
        symbol: denoms[denom].symbol,
        color: variantColor(pool.reserveCoins.length + i),
        stackId: "net",
      },
    ])
    return _.fromPairs([...currentSeries, ...historicalSeries]) as ChartConfig
  }, [pool, denoms, historicalDenoms])

  // Decimals by denom: the pool's reserves and alloy, then the API's metadata
  // for anything else. A denom without known decimals is left out of the
  // chart rather than shown as zero.
  const poolAssetDecimals = useMemo(() => {
    return {
      ..._.mapValues(denoms, (d) => d.decimals),
      ..._.chain(pool.reserveCoins)
        .map((p) => p.asset)
        .concat(pool.alloy.asset)
        .compact()
        .map((a) => [a.denom, a.decimal])
        .fromPairs()
        .value(),
    } as _.Dictionary<number>
  }, [pool, denoms])

  const data = useMemo(() => {
    return _.chain(activities)
      .map((activity) => {
        const timestamp = new Date(activity.timestamp)
        return {
          timestamp,
          count: activity.count,
          in: toDisplay(activity.in, poolAssetDecimals),
          out: toDisplay(activity.out, poolAssetDecimals),
        }
      })
      .map((point) => ({
        ...point,
        net: _.chain(_.keys(point.in))
          .union(_.keys(point.out))
          .map((denom) => [
            denom,
            (point.in[denom] ?? 0) - (point.out[denom] ?? 0),
          ])
          .fromPairs()
          .value(),
      }))
      .value()
  }, [activities, poolAssetDecimals])

  // Daily or coarser buckets (long ranges) need no time of day.
  const bucketMs =
    data.length > 1
      ? data[1].timestamp.getTime() - data[0].timestamp.getTime()
      : 0
  const labelFormat = bucketMs >= 86_400_000 ? "MMM D" : "MMM D, HH:mm"

  return (
    <ChartContainer
      className={cn("aspect-auto w-full", className)}
      config={config}
    >
      <ComposedChart data={data} stackOffset="sign" accessibilityLayer>
        <CartesianGrid vertical={false} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              indicator="line"
              className="max-w-[250px]"
              formatter={(value, name, item) => {
                const indicatorColor = item.payload.fill || item.color
                const key = `${item.name || item.dataKey || "value"}`
                const itemConfig = getPayloadConfigFromPayload(
                  config,
                  item,
                  key
                )
                const suffix = itemConfig?.symbol
                // Keys are "net.<denom>"; only the first dot splits (denoms contain none).
                const dot = key.indexOf(".")
                const series = dot === -1 ? key : key.slice(0, dot)
                const denom = dot === -1 ? undefined : key.slice(dot + 1)
                const amount = Number(value)

                return (
                  <>
                    <div
                      className="w-1 shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]"
                      style={
                        {
                          "--color-bg": indicatorColor,
                          "--color-border": indicatorColor,
                        } as React.CSSProperties
                      }
                    />
                    <div className="flex flex-1 flex-col">
                      <div className="flex items-baseline gap-2">
                        {(itemConfig?.label || name) as string}
                        <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
                          {series === "net" && amount !== 0 && (
                            <span>{amount > 0 ? "+" : "−"}</span>
                          )}
                          <DecimalSpan mantissa={2}>
                            {Math.abs(amount)}
                          </DecimalSpan>
                          {suffix && (
                            <span className="font-normal text-muted-foreground">
                              {suffix}
                            </span>
                          )}
                        </div>
                      </div>
                      {series === "net" && denom && (
                        <div className="flex gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center">
                            <LogIn className="mr-1 size-3" />
                            <DecimalSpan mantissa={2}>
                              {item.payload.in?.[denom] ?? 0}
                            </DecimalSpan>
                          </span>
                          <span className="flex items-center">
                            <LogOut className="mr-1 size-3" />
                            <DecimalSpan mantissa={2}>
                              {item.payload.out?.[denom] ?? 0}
                            </DecimalSpan>
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                )
              }}
            />
          }
          labelFormatter={(v, p) => {
            const timestamp = p[0]?.payload?.timestamp
            if (!timestamp) return v
            return dayjs(timestamp).format(labelFormat)
          }}
        />
        <ChartLegend
          content={<ChartLegendContent />}
          className="flex-wrap gap-y-1"
        />
        <XAxis
          dataKey="timestamp"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(value) => {
            return dayjs(value).format(labelFormat)
          }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          yAxisId="1"
          tickFormatter={(v) => NumberFormatter.formatCompact(v)}
        />
        <ReferenceLine y={0} yAxisId="1" stroke="hsl(var(--border))" />
        {_.chain(config)
          .map((v, k) => (
            <Bar
              key={k}
              dataKey={k}
              stackId={v.stackId}
              fill={v.color}
              yAxisId="1"
            >
              {/* Same color per symbol; net outflow is the lighter shade. */}
              {data.map((d, i) => (
                <Cell key={i} fillOpacity={(_.get(d, k) ?? 0) < 0 ? 0.45 : 1} />
              ))}
            </Bar>
          ))
          .value()}
      </ComposedChart>
    </ChartContainer>
  )
}
ActivityChartContent.displayName = "ActivityChartContent"

export { ActivityChartContent }
