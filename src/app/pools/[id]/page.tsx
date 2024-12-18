import { Metadata } from "next"
import Link from "next/link"
import { getPoolOverview } from "@/services/pool"
import _ from "lodash"
import { ExternalLink, Frown } from "lucide-react"

import { BlockExplorer } from "@/lib/block-explorer"
import { NumberFormatter } from "@/lib/number"
import { capitalName } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DecimalSpan } from "@/components/decimal-span"
import { OverviewChart } from "@/app/overview-chart"
import { PoolAssetCard, valueFormatter } from "@/app/pool-card"

import { ActivityChart } from "./activity-chart"
import { CopyDenom } from "./copy-denom"
import { PriceVolumeChart } from "./price-volume-chart"
import { SourceChart } from "./source-chart"
import { TransactionTable } from "./transaction-table"

export const runtime = "edge"
export const revalidate = 3600 // 1 hour

export const generateMetadata = async ({
  params: { id },
}: {
  params: {
    id: string
  }
}): Promise<Metadata> => {
  const pool = await getPoolOverview(id)

  if (!pool) {
    return { title: "Not Found" }
  }

  return {
    title: `${pool.alloy.asset.name} Pool`,
    description:
      pool.alloy.asset.extended_description || pool.alloy.asset.description,
  }
}

export default async function Home({
  params: { id },
}: {
  params: {
    id: string
  }
}) {
  const pool = await getPoolOverview(id)

  if (!pool) {
    return (
      <>
        <title>Not Found</title>
        <div className="flex flex-1 flex-col items-center justify-center gap-1">
          <Frown className="mb-2 size-10" />
          <h1 className="text-2xl font-semibold">Not Found</h1>
          <p className="text-muted-foreground">
            The pool is not found or is not supported.
          </p>
        </div>
      </>
    )
  }

  const totalAmount =
    pool.reserveCoins?.reduce(
      (acc, a) => acc + valueFormatter(a.currency),
      0
    ) || 0
  const counterparties = _.chain(pool.reserveCoins)
    .map((a) => ({
      ...a,
      formattedAmount: valueFormatter(a.currency),
      counterparty: _.last(a.asset.traces)?.counterparty.chain_name,
    }))
    .groupBy("counterparty")
    .mapValues((v, k) => {
      return {
        assets: v,
        totalAmount: _.sumBy(v, "formattedAmount"),
        counterparty: k,
      }
    })
    .sortBy((v) => -v.totalAmount)
    .value()

  return (
    <main className="flex items-center justify-center">
      <div className="container my-6 flex flex-col items-center gap-6 text-center">
        <div className="flex w-full flex-col gap-4 text-start md:flex-row">
          <Avatar className="size-24">
            <AvatarImage
              src={pool.alloy.asset.images[0]?.svg}
              alt={pool.alloy.asset.symbol}
            />
            <AvatarFallback>
              {capitalName(pool.alloy.asset.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col items-start gap-0.5">
            <h1 className="text-2xl font-semibold">{pool.alloy.asset.name}</h1>
            <p className="line-clamp-1 break-all text-sm font-light italic text-muted-foreground">
              {pool.poolNameByDenom}
            </p>
            <p className="whitespace-pre-wrap text-sm leading-tight text-muted-foreground">
              {pool.alloy.asset.extended_description ||
                pool.alloy.asset.description}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href={BlockExplorer.pool(pool.id)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Badge variant="secondary">
                  Pool <ExternalLink className="ml-1 size-3" />
                </Badge>
              </Link>
              <Link
                href={BlockExplorer.contract(pool.alloy.asset.address)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Badge variant="secondary">
                  Contract <ExternalLink className="ml-1 size-3" />
                </Badge>
              </Link>
              <CopyDenom denom={pool.alloy.asset.denom} />
            </div>
          </div>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 text-start md:grid-cols-4">
          <div className="rounded-md border p-2">
            <p className="text-sm text-muted-foreground">Price</p>
            <h2 className="font-semibold md:text-lg">
              {pool.alloy.price
                ? `$${NumberFormatter.formatValue(pool.alloy.price.amount)}`
                : "-"}
            </h2>
          </div>
          <div className="rounded-md border p-2">
            <p className="text-sm text-muted-foreground">Total Asset Amount</p>
            <h2 className="font-semibold md:text-lg">
              {NumberFormatter.formatValue(totalAmount)}{" "}
              <span className="font-mono text-xs font-medium">
                {pool.alloy.asset.symbol}
              </span>
            </h2>
          </div>
          <div className="rounded-md border p-2">
            <p className="text-sm text-muted-foreground">24h Trading Volume</p>
            <h2 className="line-clamp-1 font-semibold md:text-lg">
              ${NumberFormatter.formatValue(pool.volume24hUsd.amount)}
            </h2>
          </div>
          <div className="rounded-md border p-2">
            <p className="text-sm text-muted-foreground">Market Cap</p>
            <h2 className="line-clamp-1 font-semibold md:text-lg">
              {pool.alloy.price
                ? `$${NumberFormatter.formatValue(
                    Number(pool.alloy.price.amount) * totalAmount
                  )}`
                : "-"}
            </h2>
          </div>
        </div>

        <div className="grid w-full gap-6 md:grid-cols-10">
          <OverviewChart
            pools={[pool]}
            description="Historical liquidity in $USD for the pool"
            className="md:col-span-7"
          />
          <SourceChart
            counterparties={counterparties}
            totalAmount={totalAmount}
            className="md:col-span-3"
          />
        </div>

        <ActivityChart pool={pool} />

        <PriceVolumeChart denom={pool.alloy.asset.denom} />

        <Tabs defaultValue="individual" className="w-full">
          <Card>
            <CardHeader className="flex items-center justify-between gap-2 md:flex-row">
              <div className="grid flex-1 gap-1 text-center sm:text-left">
                <CardTitle>Underlying Assets</CardTitle>
                <CardDescription>
                  Underlying assets in the pool, including their respective
                  amount and source.
                </CardDescription>
              </div>
              <TabsList>
                <TabsTrigger value="individual">Individual</TabsTrigger>
                <TabsTrigger value="source">Source</TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent>
              <TabsContent value="individual">
                <div className="grid gap-2 md:grid-cols-2">
                  {pool.reserveCoins?.map((a) => (
                    <PoolAssetCard
                      key={a.asset.denom}
                      asset={a}
                      price={pool.prices[a.asset.denom]}
                      totalAmount={totalAmount}
                      limiter={pool.limiters[a.asset.denom]}
                    />
                  ))}
                </div>
              </TabsContent>
              <TabsContent value="source" className="space-y-4">
                {_.map(counterparties, (v, i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <div className="flex items-center text-start">
                      <h2 className="text-lg font-semibold md:text-xl">
                        {_.startCase(v.counterparty)}
                      </h2>
                      <div className="ml-auto text-end">
                        <DecimalSpan
                          className="font-semibold"
                          mantissa={2}
                          percent
                        >
                          {(v.totalAmount / totalAmount) * 100}
                        </DecimalSpan>
                        <p className="text-sm font-medium text-muted-foreground">
                          {pool.alloy.price?.amount
                            ? `$${NumberFormatter.formatValue(
                                v.totalAmount * Number(pool.alloy.price?.amount)
                              )}`
                            : "-"}
                        </p>
                      </div>
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                      {v.assets.map((a) => (
                        <PoolAssetCard
                          key={a.asset.denom}
                          asset={a}
                          totalAmount={totalAmount}
                          limiter={pool.limiters[a.asset.denom]}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </TabsContent>
            </CardContent>
          </Card>
        </Tabs>

        <TransactionTable pool={pool} />
      </div>
    </main>
  )
}
