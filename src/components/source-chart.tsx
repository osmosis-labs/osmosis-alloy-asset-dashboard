"use client"

import { useMemo } from "react"
import _ from "lodash"
import { Pie, PieChart } from "recharts"

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

const SourceChart = ({
  totalAmount,
  counterparties,
  className,
}: {
  counterparties: {
    totalAmount: number
    counterparty?: string
  }[]
  totalAmount: number
  className?: string
}) => {
  const { data, config } = useMemo(() => {
    const config = _.chain(counterparties)
      .map((c, i) => {
        const idx = _.range(1, 6)[i % 5]
        return [
          c.counterparty,
          {
            label: _.startCase(c.counterparty),
            color: `hsl(var(--chart-${idx})`,
          },
        ]
      })
      .fromPairs()
      .value() satisfies ChartConfig

    const data = _.chain(counterparties)
      .map((c, i) => {
        const idx = _.range(1, 6)[i % 5]
        return {
          ty: c.counterparty,
          pct: (c.totalAmount / totalAmount) * 100,
          fill: `hsl(var(--chart-${idx})`,
        }
      })
      .value()

    return {
      config,
      data,
    }
  }, [counterparties, totalAmount])

  return (
    <Card className={cn("w-full", className)}>
      <CardHeader className="text-center md:text-start">
        <CardTitle>Asset Sources</CardTitle>
        <CardDescription>
          Distribution of assets by source in the pool.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          className={cn("mx-auto aspect-square max-h-[250px]")}
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
