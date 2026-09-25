"use client"

import { useMemo, useState } from "react"
import _ from "lodash"
import { Pie, PieChart } from "recharts"

import { PoolOverview } from "@/types/pool"
import {
  getPoolSources,
  getVariantStyles,
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

const DESCRIPTIONS: Record<SourceGrouping, string> = {
  variant: "Share of the pool held in each variant.",
  issuer: "Share of the pool by provider: the bridge or issuer that minted it.",
  origin: "Share of the pool by the chain the asset was issued on.",
}

const SourceChart = ({
  pool,
  className,
}: {
  pool: PoolOverview
  className?: string
}) => {
  const [grouping, setGrouping] = useState<SourceGrouping>("issuer")

  const { data, config } = useMemo(() => {
    const groups = getPoolSources(pool, grouping)
    const totalAmount = _.sumBy(groups, "totalAmount") || 1
    // Variant slices use the variant's own color (shared with the activity
    // chart); issuer and origin slices are colored by their order.
    const variantStyles = getVariantStyles(pool)
    const colorFor = (group: (typeof groups)[number], i: number) =>
      grouping === "variant"
        ? (variantStyles[variantDenom(group.assets[0]) ?? ""]?.color ??
          sourceColor(i))
        : sourceColor(i)

    const config = _.chain(groups)
      .map((g, i) => [g.label, { label: g.label, color: colorFor(g, i) }])
      .fromPairs()
      .value() satisfies ChartConfig

    const data = groups.map((g, i) => ({
      ty: g.label,
      pct: (g.totalAmount / totalAmount) * 100,
      fill: colorFor(g, i),
    }))

    return { config, data }
  }, [pool, grouping])

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="gap-2 text-center md:text-start">
        <CardTitle>Asset Sources</CardTitle>
        <CardDescription>{DESCRIPTIONS[grouping]}</CardDescription>
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
      </CardHeader>
      <CardContent>
        <ChartContainer
          className={cn("mx-auto aspect-square h-[250px] max-h-[250px] w-auto")}
          config={config}
        >
          <PieChart>
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Pie data={data} dataKey="pct" nameKey="ty" innerRadius={40} />
            <ChartLegend
              content={<ChartLegendContent nameKey="ty" />}
              className="-translate-y-2 flex-wrap gap-2 [&>*]:basis-1/4 [&>*]:justify-center"
            />
          </PieChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
SourceChart.displayName = "SourceChart"

export { SourceChart }
