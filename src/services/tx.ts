import { unstable_noStore } from "next/cache"

import { PoolTransaction, RawPoolTransaction } from "@/types/tx"

export const getTxsByPoolIdPagination = async (
  poolId: string,
  page: number = 1,
  limit: number = 10
): Promise<PoolTransaction[]> => {
  unstable_noStore()

  page = page - 1

  const response: RawPoolTransaction[] = await fetch(
    "https://osmosis-1-graphql.alleslabs.dev/v1/graphql",
    {
      method: "POST",
      body: JSON.stringify({
        query:
          "query getTxsByPoolIdPagination($expression: pool_transactions_bool_exp, $offset: Int!, $pageSize: Int!) {\n  pool_transactions(\n    where: $expression\n    order_by: {block_height: desc, transaction_id: desc}\n    offset: $offset\n    limit: $pageSize\n  ) {\n    block {\n      height\n      timestamp\n    }\n    transaction {\n      account {\n        address\n      }\n      hash\n      success\n      messages\n      is_ibc\n    }\n  }\n}",
        variables: {
          expression: {
            pool_id: {
              _eq: Number(poolId),
            },
          },
          offset: page * limit,
          pageSize: limit,
        },
        operationName: "getTxsByPoolIdPagination",
      }),
    }
  )
    .then((res) => res.json())
    .then((res) => res.data.pool_transactions)

  const data = response.map((tx) => ({
    ...tx,
    transaction: {
      ...tx.transaction,
      hash: tx.transaction.hash.replace("\\x", "").toUpperCase(),
      messages: tx.transaction.messages,
    },
  }))

  return data
}

export const getTxsCountByPoolId = async (poolId: string): Promise<number> => {
  unstable_noStore()

  const response = await fetch(
    "https://osmosis-1-graphql.alleslabs.dev/v1/graphql",
    {
      method: "POST",
      body: JSON.stringify({
        query:
          "query getTxsCountByPoolId($expression: pool_transactions_bool_exp) {\n  pool_transactions_aggregate(where: $expression) {\n    aggregate {\n      count\n    }\n  }\n}",
        variables: {
          expression: {
            pool_id: {
              _eq: Number(poolId),
            },
          },
        },
        operationName: "getTxsCountByPoolId",
      }),
    }
  )
    .then((res) => res.json())
    .then((res) => res.data.pool_transactions_aggregate.aggregate.count)

  return response
}
