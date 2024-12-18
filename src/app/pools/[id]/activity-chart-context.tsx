"use client"

import { useMemo } from "react"
import { BigNumber } from "bignumber.js"
import _ from "lodash"
import { LogIn, LogOut } from "lucide-react"
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"

import { PoolInOutAssets, PoolOverview } from "@/types/pool"
import dayjs from "@/lib/dayjs"
import { cn } from "@/lib/utils"
import {
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
  const config = useMemo(() => {
    return _.chain(pool.reserveCoins)
      .map((p) => p.asset)
      .concat(pool.alloy.asset)
      .map((asset, i) => {
        const denom = asset.denom_units[0].denom
        const idx = (i % 5) + 1
        return [
          [
            `in.${denom}`,
            {
              asset,
              label: `${asset.name} In`,
              color: `hsl(var(--chart-${idx})`,
              stackId: "a",
            },
          ],
          [
            `out.${denom}`,
            {
              asset,
              label: `${asset.name} Out`,
              color: `hsl(var(--chart-${idx})`,
              stackId: "b",
            },
          ],
        ]
      })
      .flatten()
      .fromPairs()
      .value()
  }, [pool])

  const configWithCount = useMemo(() => {
    return _.merge({}, config, {
      count: {
        label: "Interaction Count",
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
        console.log(activity.in)
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
      .value()
  }, [activities, poolAssetDecimals])

  return (
    <ChartContainer
      className={cn("aspect-auto w-full", className)}
      config={configWithCount}
    >
      <ComposedChart data={data} accessibilityLayer>
        <CartesianGrid vertical={false} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              indicator="line"
              className="max-w-[250px]"
              formatter={(value, name, item, index, payload) => {
                const indicatorColor = item.payload.fill || item.color
                const key = `${item.name || item.dataKey || "value"}`
                const itemConfig = getPayloadConfigFromPayload(
                  configWithCount,
                  item,
                  key
                )
                const suffix = itemConfig?.asset?.symbol
                const denom = key.split(".")[1] || undefined
                const lastItem = payload[index - 1]
                const lastKey = `${lastItem?.name || lastItem?.dataKey || "value"}`
                const isFirstForThisDenom =
                  denom !== (lastKey.split(".")[1] || undefined) ||
                  denom === undefined
                const inOrOut = key.split(".")[0]
                const inOrOutOrNone =
                  inOrOut === "in" ? "in" : inOrOut === "out" ? "out" : "none"

                return (
                  <>
                    {isFirstForThisDenom && (
                      <>
                        <div
                          className={cn(
                            "w-1 shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]"
                          )}
                          style={
                            {
                              "--color-bg": indicatorColor,
                              "--color-border": indicatorColor,
                            } as React.CSSProperties
                          }
                        />
                        {((itemConfig?.label || name) as string)?.replace(
                          / In| Out/,
                          ""
                        )}
                      </>
                    )}
                    <div
                      className={cn(
                        inOrOutOrNone !== "none"
                          ? "flex basis-full items-center text-xs font-medium text-muted-foreground"
                          : "ml-auto"
                      )}
                    >
                      {inOrOutOrNone === "in" && (
                        <>
                          <LogIn className="ml-2 mr-1 size-3" /> In
                        </>
                      )}
                      {inOrOutOrNone === "out" && (
                        <>
                          <LogOut className="ml-2 mr-1 size-3" /> Out
                        </>
                      )}
                      <div className="ml-auto flex items-baseline gap-0.5 font-mono font-medium tabular-nums text-foreground">
                        <DecimalSpan mantissa={2}>
                          {value as number | string}
                        </DecimalSpan>
                        {suffix && (
                          <span className="font-normal text-muted-foreground">
                            {suffix}
                          </span>
                        )}
                      </div>
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
          width={0}
          tick={false}
          yAxisId="1"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={0}
          yAxisId="2"
          orientation="right"
        />
        {_.chain(config)
          .map((v, k) => (
            <Bar
              key={k}
              dataKey={k}
              stackId={v.stackId}
              fill={v.color}
              yAxisId="1"
            />
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
