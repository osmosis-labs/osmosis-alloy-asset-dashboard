"use client"

import "@interchain-ui/react/styles"
import "@/styles/wallet.css"

import { getAssetListUncached } from "@/services/asset"
import { getPoolsFromAPI } from "@/services/pool"
import _ from "lodash"
import { Loader2 } from "lucide-react"
import useSWRImmutable from "swr/immutable"

import { MinimalAssetPool } from "@/types/pool"

import { SwapCard } from "../../components/swap-card"
import WalletProvider from "../../components/wallet-provider"

export default function Home() {
  const { data } = useSWRImmutable(
    "/api/pools",
    async (url) => {
      const [pools, assets] = await Promise.all([
        getPoolsFromAPI(),
        getAssetListUncached().then((d) => _.keyBy(d, "denom")),
      ])

      return pools.map((pool) => ({
        id: pool.id,
        assets: pool.assets.map((asset) => assets[asset]),
        alloy: {
          asset: assets[pool.alloy.asset],
          price: pool.alloy.price,
        },
      })) as MinimalAssetPool[]
    },
    {
      fallback: [],
    }
  )

  return (
    <WalletProvider>
      <main className="container my-6 flex flex-1 flex-col items-center justify-center gap-6 text-center">
        {data && data.length > 0 ? (
          <SwapCard pools={data} />
        ) : (
          <Loader2 className="size-8 animate-spin" />
        )}
      </main>
    </WalletProvider>
  )
}
