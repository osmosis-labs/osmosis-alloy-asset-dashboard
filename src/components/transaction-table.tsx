import { Suspense } from "react"
import { getAssetPrice } from "@/services/asset"
import { getContractNamesSafe } from "@/services/contracts"
import { getDenomMetaSafe } from "@/services/denom-meta"
import { ACTIVITY_MAX_SWAPS, getPoolSwaps } from "@/services/pool"
import _ from "lodash"
import { Loader2 } from "lucide-react"

import { PoolOverview } from "@/types/pool"
import { PoolSwap } from "@/types/tx"
import { variantDenom } from "@/lib/pool-sources"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import {
  ExtraDenomMeta,
  TransactionTableContent,
} from "./transaction-table-content"

// Symbol, decimals and price for swap denoms missing from the pool's current
// reserves. The pools API omits a variant whose balance is zero, which happens
// whenever a variant is drained (e.g. by rebalancing); its swaps still need a
// value. Non-throwing: a denom that cannot be resolved stays unpriced.
const getExtraDenomMeta = async (
  pool: PoolOverview,
  swaps: PoolSwap[]
): Promise<Record<string, ExtraDenomMeta>> => {
  const known = new Set(
    _.compact([
      ...pool.reserveCoins.map((c) => variantDenom(c)),
      pool.alloy.asset?.base,
    ])
  )
  const missing = _.uniq(
    swaps.flatMap((s) => [s.in.denom, s.out.denom])
  ).filter((d) => !known.has(d))
  if (missing.length === 0) return {}
  const [meta, prices] = await Promise.all([
    getDenomMetaSafe(missing),
    Promise.all(missing.map((d) => getAssetPrice(d))),
  ])
  return _.fromPairs(
    _.compact(
      missing.map((denom, i) => {
        if (!meta[denom]) return null
        const price = Number(prices[i]?.amount)
        return [
          denom,
          {
            ...meta[denom],
            price: Number.isFinite(price) && price > 0 ? price : undefined,
          },
        ]
      })
    )
  )
}

const TransactionTable = ({ pool }: { pool: PoolOverview }) => {
  return (
    <Card className="w-full">
      <CardHeader className="text-center md:text-start">
        <CardTitle>Recent Swaps</CardTitle>
        <CardDescription>
          Up to the latest {ACTIVITY_MAX_SWAPS.toLocaleString("en-US")} swaps
          from the past 31 days, with the amounts that entered and left the pool
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense
          fallback={
            <div className="flex h-[300px] w-full items-center justify-center">
              <Loader2 className="size-8 animate-spin" />
            </div>
          }
        >
          <SuspensedTransactionTable pool={pool} />
        </Suspense>
      </CardContent>
    </Card>
  )
}
TransactionTable.displayName = "TransactionTable"

const SuspensedTransactionTable = async ({ pool }: { pool: PoolOverview }) => {
  try {
    const swaps = await getPoolSwaps(pool.id)
    const [contractNames, extraDenoms] = await Promise.all([
      getContractNamesSafe(swaps.map((s) => s.contract)),
      getExtraDenomMeta(pool, swaps),
    ])
    return (
      <TransactionTableContent
        pool={pool}
        swaps={swaps}
        contractNames={contractNames}
        extraDenoms={extraDenoms}
      />
    )
  } catch (error) {
    console.error(`Failed to fetch swaps for pool ${pool.id}:`, error)
    return (
      <div className="flex h-[300px] w-full items-center justify-center">
        <p className="text-muted-foreground">Unable to load swaps</p>
      </div>
    )
  }
}

export { TransactionTable }
