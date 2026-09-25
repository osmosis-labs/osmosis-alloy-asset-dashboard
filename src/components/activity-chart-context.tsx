"use client"

import { useMemo } from "react"
import { BigNumber } from "bignumber.js"
import _ from "lodash"
import { LogIn, LogOut } from "lucide-react"
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts"

import { PoolInOutAssets, PoolOverview } from "@/types/pool"
import dayjs from "@/lib/dayjs"
import { NumberFormatter } from "@/lib/number"
import {
  getVariantStyles,
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

const ActivityChartContent = ({
  activities,
  className,
  pool,
}: {
  activities: PoolInOutAssets[]
  pool: PoolOverview
  className?: string
}) => {
  // One net-flow series per asset: positive when more of it entered the pool
  // than left in the bucket, negative when it drained. A transmuter swap moves
  // one variant in and another out, so the signed net per variant shows which
  // way the pool is being rebalanced. Variants are labelled with the frontend
  // symbol and colored like their source in the Asset Sources chart; the
  // alloy's own series (mint/burn) is neutral.
  const config = useMemo(() => {
    const variantStyles = getVariantStyles(pool)
    const variants = pool.reserveCoins.map((coin) => {
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
    const alloy = pool.alloy.asset
      ? [
          [
            `net.${pool.alloy.asset.base}`,
            {
              label: pool.alloy.asset.display,
              symbol: pool.alloy.asset.display,
              color: "hsl(var(--muted-foreground))",
              stackId: "net",
            },
          ],
        ]
      : []
    return _.fromPairs([...variants, ...alloy]) as ChartConfig
  }, [pool])

  const configWithCount = useMemo(() => {
    return _.merge({}, config, {
      count: {
        label: "Swaps",
        color: "hsl(var(--primary))",
      },
    })
  }, [config])

  const poolAssetDecimals = useMemo(() => {
    return _.chain(pool.reserveCoins)
      .map((p) => p.asset)
      .concat(pool.alloy.asset)
      .map((a) => [a.denom, a.decimal])
      .fromPairs()
      .value() as _.Dictionary<number>
  }, [pool])

  const data = useMemo(() => {
    return _.chain(activities)
      .map((activity) => {
        const timestamp = new Date(activity.timestamp)
        return {
          timestamp,
          count: activity.count,
          in: _.chain(activity.in)
            .mapValues((v, k) => {
              try {
                return new BigNumber(v)
                  .shiftedBy(-poolAssetDecimals[k])
                  .toNumber()
              } catch (e) {
                return 0
              }
            })
            .value(),
          out: _.chain(activity.out)
            .mapValues((v, k) => {
              try {
                return new BigNumber(v)
                  .shiftedBy(-poolAssetDecimals[k])
                  .toNumber()
              } catch (e) {
                return 0
              }
            })
            .value(),
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

  return (
    <ChartContainer
      className={cn("aspect-auto w-full", className)}
      config={configWithCount}
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
                  configWithCount,
                  item,
                  key
                )
                const suffix = itemConfig?.symbol
                // Keys are "net.<denom>" or "count"; only the first dot splits.
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
            return dayjs(timestamp).format("ddd D, HH:mm")
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
            return dayjs(value).format("ddd D, HH:mm")
          }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={48}
          yAxisId="1"
          tickFormatter={(v) => NumberFormatter.formatCompact(v)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={40}
          yAxisId="2"
          orientation="right"
          allowDecimals={false}
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
        <Line
          yAxisId="2"
          type="monotone"
          dataKey="count"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ChartContainer>
  )
}
ActivityChartContent.displayName = "ActivityChartContent"

export { ActivityChartContent }
