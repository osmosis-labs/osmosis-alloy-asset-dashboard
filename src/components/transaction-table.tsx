import { getAssetListSafe } from "@/services/asset"
import _ from "lodash"

import { PoolOverview } from "@/types/pool"

import { TransactionTableContent } from "./transaction-table-content"

const TransactionTable = async ({ pool }: { pool: PoolOverview }) => {
  // Safe (non-throwing) list so a transient assetlist blip cannot crash the
  // pool detail page render; the tx table just formats amounts without the
  // asset metadata in that rare window.
  const assets = _.keyBy(await getAssetListSafe(), "base")

  return <TransactionTableContent assets={assets} pool={pool} />
}
TransactionTable.displayName = "TransactionTable"

export { TransactionTable }
