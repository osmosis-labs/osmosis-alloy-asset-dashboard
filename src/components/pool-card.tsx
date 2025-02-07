import Link from "next/link"
import { LIMITERS } from "@/constants/limiter"
import { TooltipArrow } from "@radix-ui/react-tooltip"
import BigNumber from "bignumber.js"
import _ from "lodash"
import { ChevronRight, ExternalLink, Info } from "lucide-react"

import { Asset, CurrencyAmount } from "@/types/asset"
import { Limiter } from "@/types/limiter"
import { PoolOverview } from "@/types/pool"
import { BlockExplorer } from "@/lib/block-explorer"
import { NumberFormatter } from "@/lib/number"
import { cn, getAssetImageUrl } from "@/lib/utils"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { DecimalSpan } from "@/components/decimal-span"

import { OverviewChartContent } from "./overview-chart"

const valueFormatter = (a: CurrencyAmount) => {
  return new BigNumber(Number.isNaN(a.amount) ? 0 : a.amount)
    .shiftedBy(-(a.currency?.coinDecimals || 6))
    .toNumber()
}

const PoolCard = ({ pool }: { pool: PoolOverview }) => {
  const totalAmount =
    pool.reserveCoins?.reduce(
      (acc, a) => acc + valueFormatter(a.currency),
      0
    ) || 0

  return (
    <Card>
      <CardHeader className="flex-col gap-2 text-start md:flex-row md:items-center">
        <Avatar className="size-8 md:size-12">
          <AvatarImage
            src={pool.alloy.asset.images[0].svg}
            alt={pool.alloy.asset.name}
          />
        </Avatar>
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 md:mb-0">
            <h1 className="text-lg font-semibold">{pool.alloy.asset.name}</h1>
            <Badge size="sm">{pool.alloy.asset.symbol}</Badge>
            <Link
              href={BlockExplorer.pool(pool.id)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Badge size="sm" variant="secondary">
                Pool <ExternalLink className="ml-1 size-3" />
              </Badge>
            </Link>
            <Link
              href={BlockExplorer.contract(pool.alloy.asset.address)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Badge size="sm" variant="secondary">
                Contract <ExternalLink className="ml-1 size-3" />
              </Badge>
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">
            {pool.alloy.asset.extended_description ||
              pool.alloy.asset.description}
          </p>
        </div>
        <Link
          href={`/pools/${pool.id}`}
          className={cn(buttonVariants(), "md:ml-auto")}
        >
          View Details <ChevronRight className="ml-2 size-4" />
        </Link>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2 md:grid md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <div className="grid h-fit grid-cols-2 gap-2 text-start *:h-full">
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground md:text-sm">
                  Price
                </p>
                <h2 className="font-semibold md:text-lg">
                  {pool.alloy.price
                    ? `$${NumberFormatter.formatValue(pool.alloy.price.amount)}`
                    : "-"}
                </h2>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground md:text-sm">
                  Total Asset Amount
                </p>
                <h2 className="font-semibold md:text-lg">
                  {NumberFormatter.formatValue(totalAmount)}{" "}
                  <span className="hidden font-mono text-xs font-medium md:inline">
                    {pool.alloy.asset.symbol}
                  </span>
                </h2>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground md:text-sm">
                  24h Trading Volume
                </p>
                <h2 className="line-clamp-1 font-semibold md:text-lg">
                  ${NumberFormatter.formatValue(pool.volume24hUsd.amount)}
                </h2>
              </div>
              <div className="rounded-md border p-2">
                <p className="text-xs text-muted-foreground md:text-sm">
                  Market Cap
                </p>
                <h2 className="line-clamp-1 font-semibold md:text-lg">
                  {pool.alloy.price
                    ? `$${NumberFormatter.formatValue(
                        Number(pool.alloy.price.amount) * totalAmount
                      )}`
                    : "-"}
                </h2>
              </div>
            </div>
            <OverviewChartContent
              pools={[pool]}
              className="max-h-[700px] min-h-[200px] flex-1 rounded-md border p-2"
            />
          </div>
          {pool.reserveCoins && (
            <div className="flex flex-col gap-2">
              {pool.reserveCoins.map((c, i) => (
                <PoolAssetCard
                  key={i}
                  asset={c}
                  totalAmount={totalAmount}
                  limiter={pool.limiters[c.asset.base]}
                  price={pool.prices[c.asset.base]}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
PoolCard.displayName = "PoolCard"

const PoolAssetCard = ({
  asset: c,
  totalAmount,
  className,
  limiter,
  price,
}: {
  asset: {
    asset: Asset
    currency: CurrencyAmount
  }
  totalAmount: number
  className?: string
  limiter?: Limiter
  price?: number
}) => {
  const thisAmount = valueFormatter(c.currency)
  const percentage = thisAmount / totalAmount
  const counterparty = _.startCase(
    _.last(c.asset.traces)?.counterparty.chain_name
  )

  return (
    <div
      className={cn(
        "flex h-fit flex-col gap-2 rounded-md border p-2 text-start",
        className
      )}
    >
      <div className="flex flex-col gap-2 p-2 md:flex-row md:items-center">
        <Avatar>
          <AvatarImage src={getAssetImageUrl(c.asset)} alt={c.asset.name} />
        </Avatar>
        <div className="mr-2 flex flex-col space-y-0.5">
          <div className="inline-flex flex-wrap items-center gap-2 font-semibold leading-none">
            <span>{c.asset.name}</span>
            <Badge size="xs">{c.asset.symbol}</Badge>
            <Badge size="xs" variant="secondary">
              {counterparty}
            </Badge>
          </div>
          <p className="line-clamp-2 whitespace-pre-wrap break-all text-xs text-muted-foreground">
            {c.asset.description}
          </p>
        </div>
        <div className="text-center md:ml-auto md:text-end">
          <h2 className="font-semibold">
            {price ? `$${NumberFormatter.formatValue(price)}` : "-"}
          </h2>
          {
            //<p
            //className={cn(
            //"text-xs text-muted-foreground",
            //percentColorCn(c.price_24h_change / 100 + 1)
            //)}
            //>
            //{NumberFormatter.formatPercent(c.price_24h_change / 100)}
            //</p>
          }
        </div>
      </div>
      {limiter && (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="rounded-md border p-2">
                <div className="flex items-center gap-1 text-sm">
                  <span className="font-bold">
                    {_.startCase(limiter.type)} Limiter
                  </span>
                  <span className="font-medium">Enforced</span>
                  <Info className="size-3" />
                </div>
                {limiter.type === "static" && (
                  <div className="flex items-center gap-2">
                    <Progress
                      className="h-2.5 w-full"
                      value={new BigNumber(percentage)
                        .multipliedBy(100)
                        .dividedBy(limiter.upper_limit)
                        .toNumber()}
                    />
                    <div className="whitespace-nowrap font-mono text-xs">
                      Limit{" "}
                      <DecimalSpan mantissa={2}>{percentage * 100}</DecimalSpan>
                      /{(Number(limiter.upper_limit) * 100).toFixed(2)}%
                    </div>
                  </div>
                )}
              </div>
            </TooltipTrigger>
            {
              <TooltipContent className="max-w-[350px]">
                <TooltipArrow />
                <h2 className="font-semibold">
                  {LIMITERS[limiter.type].title}
                </h2>
                <span className="text-xs">
                  {LIMITERS[limiter.type].description}
                </span>
              </TooltipContent>
            }
          </Tooltip>
        </TooltipProvider>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md border p-2">
          <p className="text-xs text-muted-foreground">Amount</p>
          <DecimalSpan className="font-semibold">{thisAmount}</DecimalSpan>
        </div>
        <div className="rounded-md border p-2">
          <p className="text-xs text-muted-foreground">Percentage</p>
          <DecimalSpan className="font-semibold" percent mantissa={2}>
            {percentage * 100}
          </DecimalSpan>
        </div>
      </div>
    </div>
  )
}

export { PoolCard, valueFormatter, PoolAssetCard }
