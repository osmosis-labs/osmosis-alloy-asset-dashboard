import { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getPoolComposition } from "@/services/composition"
import {
  getPoolOverview,
  getPoolsOverview,
  isMigrationPool,
} from "@/services/pool"
import _ from "lodash"
import { ExternalLink } from "lucide-react"

import { BlockExplorer, OsmosisApp } from "@/lib/block-explorer"
import { NumberFormatter } from "@/lib/number"
import { getPoolSources, SOURCE_GROUPINGS } from "@/lib/pool-sources"
import { capitalName, cn, getAssetImageUrl } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DataFreshnessNotice } from "@/components/data-freshness"
import { DateRangeProvider } from "@/components/date-range"
import { DecimalSpan, SmallDecimals } from "@/components/decimal-span"
import { OverviewChart } from "@/components/overview-chart"
import {
  limitersFor,
  PoolAssetCard,
  PoolStats,
  TradeLinks,
  valueFormatter,
} from "@/components/pool-card"
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

// Next 15: route params arrive as a Promise.
type PoolPageProps = { params: Promise<{ id: string }> }

export const generateMetadata = async ({
  params,
}: PoolPageProps): Promise<Metadata> => {
  const { id } = await params
  const pool = await getPoolOverview(id)

  if (!pool) notFound()

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

export default async function Home({ params }: PoolPageProps) {
  const { id } = await params
  const pool = await getPoolOverview(id)

  // A real 404 (not a 200 "Not Found" page), so links to a pool the
  // dashboard does not list are reported as broken.
  if (!pool) notFound()

  const totalAmount =
    pool.reserveCoins?.reduce(
      (acc, a) => acc + valueFormatter(a.currency),
      0
    ) || 0
  // Reserve history for Backing Over Time; null (chart hidden) until the
  // activity store has at least two snapshots for this pool.
  const composition = await getPoolComposition(pool.id)
  // Cached: the same overview getPoolOverview read, for its data freshness.
  const { source, builtAt } = await getPoolsOverview()
  const isMigration = isMigrationPool(pool)
  const groupedSources = {
    issuer: getPoolSources(pool, "issuer"),
    origin: getPoolSources(pool, "origin"),
  }

  return (
    <main className="flex items-center justify-center">
      <div className="container my-6 flex flex-col items-center gap-6 text-center">
        <DataFreshnessNotice source={source} builtAt={builtAt} />
        <div
          className={cn(
            "flex w-full flex-col gap-4 text-start md:flex-row",
            poolTileClass(pool.status) && "rounded-lg border p-4",
            poolTileClass(pool.status)
          )}
        >
          <Avatar className="size-24">
            <AvatarImage src={getAssetImageUrl(pool.alloy.asset)} alt="" />
            <AvatarFallback>
              {capitalName(pool.alloy.asset.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col items-start gap-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">
                {pool.alloy.asset.name}
              </h1>
              {isMigration && <Badge variant="outline">Migration</Badge>}
              <PoolStatusBadges pool={pool} />
            </div>
            {!isMigration && (
              <p className="text-sm">
                An alloyed asset: one {pool.alloy.asset.symbol} is backed 1:1 by
                the variants below, held by this pool&apos;s transmuter
                contract.
              </p>
            )}
            <p className="whitespace-pre-wrap text-sm leading-tight text-muted-foreground">
              {pool.alloy.asset.extended_description ||
                pool.alloy.asset.description}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <TradeLinks pool={pool} />
              {!isMigration && (
                <Link
                  href={`/swap?pool=${pool.id}`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  Transmuter Swap
                </Link>
              )}
              <Link
                href={OsmosisApp.pool(pool.id)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Badge variant="secondary" className="min-h-6">
                  Pool <ExternalLink className="ml-1 size-3" aria-hidden />
                  <span className="sr-only"> (opens in a new tab)</span>
                </Badge>
              </Link>
              <Link
                href={BlockExplorer.contract(pool.alloy.asset.address)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Badge variant="secondary" className="min-h-6">
                  Contract <ExternalLink className="ml-1 size-3" aria-hidden />
                  <span className="sr-only"> (opens in a new tab)</span>
                </Badge>
              </Link>
              <CopyDenom denom={pool.alloy.asset.denom} />
            </div>
          </div>
        </div>
        <PoolStats
          pool={pool}
          totalAmount={totalAmount}
          className="w-full grid-cols-2 md:grid-cols-4"
        />

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
                        limiters={limitersFor(pool, a.asset.base)}
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
                          <h3 className="text-lg font-semibold md:text-xl">
                            {v.label}
                          </h3>
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
                              limiters={limitersFor(pool, a.asset.base)}
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

          {composition ? (
            <CompositionChart pool={pool} composition={composition} />
          ) : (
            <Card className="w-full text-start">
              <CardHeader>
                <CardTitle>Backing Over Time</CardTitle>
                <CardDescription>
                  The pool&apos;s backing history is still being collected: it
                  appears here once there are at least two hourly snapshots.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* A migration alloy's token is not a listed asset, so it has no
              price history. */}
          {!isMigration && <PriceVolumeChart denom={pool.alloy.asset.denom} />}

          <TransactionTable pool={pool} />
        </DateRangeProvider>
      </div>
    </main>
  )
}
