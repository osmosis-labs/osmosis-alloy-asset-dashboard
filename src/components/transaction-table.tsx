import { Suspense } from "react"
import { ACTIVITY_MAX_SWAPS, getPoolSwaps } from "@/services/pool"
import { Loader2 } from "lucide-react"

import { PoolOverview } from "@/types/pool"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import { TransactionTableContent } from "./transaction-table-content"

const TransactionTable = ({ pool }: { pool: PoolOverview }) => {
  return (
    <Card className="w-full">
      <CardHeader className="text-center md:text-start">
        <CardTitle>Recent Swaps</CardTitle>
        <CardDescription>
          Swaps through this pool over the last 24 hours, up to the{" "}
          {ACTIVITY_MAX_SWAPS.toLocaleString("en-US")} most recent, with the
          amounts that entered and left the pool.
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
    return <TransactionTableContent pool={pool} swaps={swaps} />
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
