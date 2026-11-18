import { Link } from "react-router"
import { getPoolComposition } from "@/services/composition"
import { getPoolOverview, getPoolsOverview } from "@/services/pool"
import { loadSwaps } from "@/services/load-swaps"
import { isTradesFeedEnabled } from "@/services/trades"
import { ExternalLink } from "lucide-react"

import { BlockExplorer, OsmosisApp } from "@/lib/block-explorer"
import { NumberFormatter } from "@/lib/number"
import { isMigrationPool } from "@/lib/pool-build"
import {
  getPoolSources,
  isCorruptedVariant,
  isPayoutVariant,
  poolBacking,
  reserveValue,
  SOURCE_GROUPINGS,
} from "@/lib/pool-sources"
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
} from "@/components/pool-card"
import { PoolStatusBadges, poolTileClass } from "@/components/status-badges"
import { ActivityChart } from "@/components/activity-chart"
import { CompositionChart } from "@/components/composition-chart"
import { CopyDenom } from "@/components/copy-denom"
import { PriceVolumeChart } from "@/components/price-volume-chart"
import { SourceChart } from "@/components/source-chart"
import { TransactionTable } from "@/components/transaction-table"

import { cachedPageHeaders, pageMeta } from "../meta"
import type { Route } from "./+types/pools.$id"

export const meta: Route.MetaFunction = ({ loaderData }) => {
  if (!loaderData?.pool) return pageMeta({ title: "Pool" })
  const { pool } = loaderData
  return pageMeta({
    title: `${pool.alloy.asset.name} Pool`,
    description:
      pool.alloy.asset.extended_description || pool.alloy.asset.description,
    path: `/pools/${pool.id}`,
    image: `/pools/${pool.id}/opengraph-image`,
  })
}

export const headers: Route.HeadersFunction = ({ errorHeaders }) =>
  cachedPageHeaders({ errorHeaders })

export async function loader({ params }: Route.LoaderArgs) {
  const pool = await getPoolOverview(params.id)
  // A real 404, so links to a pool the dashboard does not list are broken.
  if (!pool) throw new Response(null, { status: 404 })

  const composition = await getPoolComposition(pool.id)
  // Cached: the same overview getPoolOverview read, for its data freshness.
  const { source, builtAt } = await getPoolsOverview()
  // With the SQS trade feed configured the table fetches its own pages.
  const tradesFeed = isTradesFeedEnabled()
  return {
    pool,
    composition,
    source,
    builtAt,
    tradesFeed,
    // Streamed: the swap table does not hold up the rest of the page.
    swaps: tradesFeed ? null : loadSwaps(pool),
  }
}

export default function PoolPage({ loaderData }: Route.ComponentProps) {
  const { pool, composition, source, builtAt, swaps, tradesFeed } = loaderData
  const totalAmount =
    pool.reserveCoins?.reduce((acc, a) => acc + reserveValue(a), 0) ||
    0
  const isMigration = isMigrationPool(pool)
  // Variants SQS cannot price have no market left on Osmosis, and a plain
  // swap out of the alloy then routes through whatever thin pools remain.
  // The notice needs both signals: the variants have no price of their own
  // (valued at the alloy price by poolBacking), and the pools API (SQS
  // liquidity cap, a separate source) values the pool at under half its
  // backing. A failed price fetch alone, or a small unpriced variant in an
  // otherwise liquid alloy, does not show it.
  const backing = poolBacking(pool)
  const apiTvlUsd = Number(pool.totalFiatValueLocked?.amount)
  const unpricedVariants =
    backing.usd !== null && apiTvlUsd < backing.usd / 2
      ? backing.atAlloyPrice
      : []
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
              <h1 className="text-2xl font-semibold">{pool.alloy.asset.name}</h1>
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
                  to={`/swap?pool=${pool.id}`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  Transmuter Swap
                </Link>
              )}
              <a
                href={OsmosisApp.pool(pool.id)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Badge variant="secondary" className="min-h-6">
                  Pool <ExternalLink className="ml-1 size-3" aria-hidden />
                  <span className="sr-only"> (opens in a new tab)</span>
                </Badge>
              </a>
              <a
                href={BlockExplorer.contract(pool.alloy.asset.address)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Badge variant="secondary" className="min-h-6">
                  Contract <ExternalLink className="ml-1 size-3" aria-hidden />
                  <span className="sr-only"> (opens in a new tab)</span>
                </Badge>
              </a>
              <CopyDenom denom={pool.alloy.asset.denom} />
            </div>
          </div>
        </div>
        {!isMigration && unpricedVariants.length > 0 && (
          <div
            role="note"
            className="w-full rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-start text-sm"
          >
            <p className="font-semibold">
              No market for {unpricedVariants.join(", ")} on Osmosis
            </p>
            <p>
              There is little or no trading liquidity for this pool&apos;s
              backing, so swapping {pool.alloy.asset.symbol} straight into
              another token can return far less than it is worth. Its backing is
              unaffected: to exit at full value, redeem{" "}
              {pool.alloy.asset.symbol} 1:1 for the backing asset with{" "}
              <Link to={`/swap?pool=${pool.id}`} className="underline">
                Transmuter Swap
              </Link>{" "}
              (no fee), then bridge it out to its origin chain and sell it
              there.
            </p>
          </div>
        )}
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
                        corrupted={isCorruptedVariant(pool.status, a.asset.base)}
                        payout={isPayoutVariant(pool.status, a.asset.base)}
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
                              corrupted={isCorruptedVariant(
                                pool.status,
                                a.asset.base
                              )}
                              payout={isPayoutVariant(
                                pool.status,
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

          {!isMigration && <PriceVolumeChart denom={pool.alloy.asset.denom} />}

          <TransactionTable pool={pool} swaps={swaps} tradesFeed={tradesFeed} />
        </DateRangeProvider>
      </div>
    </main>
  )
}
