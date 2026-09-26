import { Metadata } from "next"
import Link from "next/link"
import { getPoolComposition } from "@/services/composition"
import { getPoolOverview, getPoolsOverview } from "@/services/pool"
import _ from "lodash"
import { ExternalLink, Frown } from "lucide-react"

import { BlockExplorer, OsmosisApp } from "@/lib/block-explorer"
import { NumberFormatter } from "@/lib/number"
import { getPoolSources, SOURCE_GROUPINGS } from "@/lib/pool-sources"
import { capitalName, cn, getAssetImageUrl } from "@/lib/utils"
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
import { DateRangeProvider } from "@/components/date-range"
import { DecimalSpan, SmallDecimals } from "@/components/decimal-span"
import { OverviewChart } from "@/components/overview-chart"
import { PoolAssetCard, valueFormatter } from "@/components/pool-card"
import { PoolStatusBadges, poolTileClass } from "@/components/status-badges"

import { ActivityChart } from "../../../components/activity-chart"
import { CompositionChart } from "../../../components/composition-chart"
import { CopyDenom } from "../../../components/copy-denom"
import { PriceVolumeChart } from "../../../components/price-volume-chart"
import { SourceChart } from "../../../components/source-chart"
import { TransactionTable } from "../../../components/transaction-table"

// Pool activity is read from the Postgres store (refreshed by the 15-minute
// cron), so pages can rebuild often without adding LCD load.
export const revalidate = 300 // 5 minutes
// Above Vercel's 15s default; see src/app/page.tsx.
export const maxDuration = 60

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

export async function generateStaticParams() {
  const { pools } = await getPoolsOverview()

  return pools.map((pool) => ({
    id: pool.id,
  }))
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
  // Reserve history for Backing Over Time; null (chart hidden) until the
  // activity store has at least two snapshots for this pool.
  const composition = await getPoolComposition(pool.id)
  const groupedSources = {
    issuer: getPoolSources(pool, "issuer"),
    origin: getPoolSources(pool, "origin"),
  }

  return (
    <main className="flex items-center justify-center">
      <div className="container my-6 flex flex-col items-center gap-6 text-center">
        <div
          className={cn(
            "flex w-full flex-col gap-4 text-start md:flex-row",
            poolTileClass(pool.status) && "rounded-lg border p-4",
            poolTileClass(pool.status)
          )}
        >
          <Avatar className="size-24">
            <AvatarImage
              src={getAssetImageUrl(pool.alloy.asset)}
              alt={pool.alloy.asset.symbol}
            />
            <AvatarFallback>
              {capitalName(pool.alloy.asset.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col items-start gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">
                {pool.alloy.asset.name}
              </h1>
              <PoolStatusBadges pool={pool} />
            </div>
            <p className="line-clamp-1 break-all text-sm font-light italic text-muted-foreground">
              {pool.poolNameByDenom}
            </p>
            <p className="whitespace-pre-wrap text-sm leading-tight text-muted-foreground">
              {pool.alloy.asset.extended_description ||
                pool.alloy.asset.description}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href={OsmosisApp.pool(pool.id)}
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
              <SmallDecimals>
                {pool.alloy.price
                  ? `$${NumberFormatter.formatValue(pool.alloy.price.amount)}`
                  : "-"}
              </SmallDecimals>
            </h2>
          </div>
          <div className="rounded-md border p-2">
            <p className="text-sm text-muted-foreground">Total Asset Amount</p>
            <h2 className="font-semibold md:text-lg">
              <SmallDecimals>
                {NumberFormatter.formatValue(totalAmount)}
              </SmallDecimals>{" "}
              <span className="font-mono text-xs font-medium">
                {pool.alloy.asset.symbol}
              </span>
            </h2>
          </div>
          <div className="rounded-md border p-2">
            <p className="text-sm text-muted-foreground">24h Trading Volume</p>
            <h2 className="line-clamp-1 font-semibold md:text-lg">
              <SmallDecimals>
                {`$${NumberFormatter.formatValue(pool.volume24hUsd.amount)}`}
              </SmallDecimals>
            </h2>
          </div>
          <div className="rounded-md border p-2">
            <p className="text-sm text-muted-foreground">Market Cap</p>
            <h2 className="line-clamp-1 font-semibold md:text-lg">
              <SmallDecimals>
                {pool.alloy.price
                  ? `$${NumberFormatter.formatValue(
                      Number(pool.alloy.price.amount) * totalAmount
                    )}`
                  : "-"}
              </SmallDecimals>
            </h2>
          </div>
        </div>

        <DateRangeProvider>
          <div className="grid w-full gap-6 md:grid-cols-10">
            <OverviewChart
              pools={[pool]}
              description="Historical liquidity of the pool in USD"
              className="md:col-span-7"
              fillHeight
            />
            <SourceChart pool={pool} className="md:col-span-3" />
          </div>

          <Tabs defaultValue="variant" className="w-full">
            <Card>
              <CardHeader className="flex items-center justify-between gap-2 md:flex-row">
                <div className="grid flex-1 gap-1 text-center sm:text-left">
                  <CardTitle>Underlying Assets</CardTitle>
                  <CardDescription>
                    Underlying assets in the pool with their amounts, by
                    variant, by provider, or by origin chain.
                  </CardDescription>
                </div>
                <TabsList>
                  {SOURCE_GROUPINGS.map((g) => (
                    <TabsTrigger key={g.value} value={g.value}>
                      {g.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </CardHeader>
              <CardContent>
                <TabsContent value="variant">
                  <div className="grid gap-2 md:grid-cols-2">
                    {pool.reserveCoins?.map((a) => (
                      <PoolAssetCard
                        key={a.asset.denom}
                        asset={a}
                        price={pool.prices[a.asset.base]}
                        totalAmount={totalAmount}
                        limiter={pool.limiters[a.asset.base]}
                        status={pool.status?.reserves?.[a.asset.base]}
                        corrupted={pool.status?.corruptedDenoms?.includes(
                          a.asset.base
                        )}
                      />
                    ))}
                  </div>
                </TabsContent>
                {(["issuer", "origin"] as const).map((grouping) => (
                  <TabsContent
                    key={grouping}
                    value={grouping}
                    className="space-y-4"
                  >
                    {groupedSources[grouping].map((v, i) => (
                      <div key={i} className="flex flex-col gap-2">
                        <div className="flex items-center text-start">
                          <h2 className="text-lg font-semibold md:text-xl">
                            {v.label}
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
                              <SmallDecimals>
                                {pool.alloy.price?.amount
                                  ? `$${NumberFormatter.formatValue(
                                      v.totalAmount *
                                        Number(pool.alloy.price?.amount)
                                    )}`
                                  : "-"}
                              </SmallDecimals>
                            </p>
                          </div>
                        </div>
                        <div className="grid gap-2 md:grid-cols-2">
                          {v.assets.map((a) => (
                            <PoolAssetCard
                              key={a.asset.denom}
                              asset={a}
                              price={pool.prices[a.asset.base]}
                              totalAmount={totalAmount}
                              limiter={pool.limiters[a.asset.base]}
                              status={pool.status?.reserves?.[a.asset.base]}
                              corrupted={pool.status?.corruptedDenoms?.includes(
                                a.asset.base
                              )}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </TabsContent>
                ))}
              </CardContent>
            </Card>
          </Tabs>

          <ActivityChart pool={pool} />

          {composition && (
            <CompositionChart pool={pool} composition={composition} />
          )}

          <PriceVolumeChart denom={pool.alloy.asset.denom} />

          <TransactionTable pool={pool} />
        </DateRangeProvider>
      </div>
    </main>
  )
}
