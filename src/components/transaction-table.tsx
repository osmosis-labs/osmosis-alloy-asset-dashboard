import { getAssetMap } from "@/services/asset"

import { PoolOverview } from "@/types/pool"

import { TransactionTableContent } from "./transaction-table-content"

const TransactionTable = async ({ pool }: { pool: PoolOverview }) => {
  const assets = await getAssetMap()

  return <TransactionTableContent assets={assets} pool={pool} />
}
TransactionTable.displayName = "TransactionTable"

export { TransactionTable }
