import { Suspense } from "react"
import { Await } from "react-router"
import { Loader2 } from "lucide-react"

import { ACTIVITY_MAX_SWAPS } from "@/lib/activity"
import { PoolOverview } from "@/types/pool"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import type { SwapsResult } from "@/services/load-swaps"
import { TransactionTableContent } from "./transaction-table-content"

const TransactionTable = ({
  pool,
  swaps,
}: {
  pool: PoolOverview
  swaps: Promise<SwapsResult>
}) => {
  return (
    <Card className="w-full">
      <CardHeader className="text-center md:text-start">
        <CardTitle>Recent Swaps</CardTitle>
        <CardDescription>
          Up to the latest {ACTIVITY_MAX_SWAPS.toLocaleString("en-US")} swaps
          from the past 7 days, with the amounts that entered and left the pool
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Suspense
          fallback={
            <div
              role="status"
              className="flex h-[300px] w-full items-center justify-center"
            >
              <Loader2 className="size-8 animate-spin" />
              <span className="sr-only">Loading swaps</span>
            </div>
          }
        >
          <Await resolve={swaps}>
            {(result) =>
              result.ok ? (
                <TransactionTableContent
                  pool={pool}
                  swaps={result.swaps}
                  contractNames={result.contractNames}
                  extraDenoms={result.extraDenoms}
                />
              ) : (
                <div className="flex h-[300px] w-full items-center justify-center">
                  <p className="text-muted-foreground">Unable to load swaps</p>
                </div>
              )
            }
          </Await>
        </Suspense>
      </CardContent>
    </Card>
  )
}
TransactionTable.displayName = "TransactionTable"

export { TransactionTable }
