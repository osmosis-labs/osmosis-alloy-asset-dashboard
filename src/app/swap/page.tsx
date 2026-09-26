"use client"

import "@interchain-ui/react/styles"
import "@/styles/wallet.css"

import { getAssetListUncached } from "@/services/asset"
import { getPoolsFromAPI } from "@/services/pools-api"
import _ from "lodash"
import { Loader2 } from "lucide-react"
import useSWRImmutable from "swr/immutable"

import { buildSwapPools } from "@/lib/swap-pools"
import { Button } from "@/components/ui/button"

import { SwapCard } from "../../components/swap-card"
import WalletProvider from "../../components/wallet-provider"

export default function Home() {
  const { data, error, isValidating, mutate } = useSWRImmutable(
    "/api/pools",
    async () => {
      const [pools, assets] = await Promise.all([
        getPoolsFromAPI(),
        getAssetListUncached().then((d) => _.keyBy(d, "denom")),
      ])
      return buildSwapPools(pools, assets)
    }
  )

  return (
    <WalletProvider>
      <main className="container my-6 flex flex-1 flex-col items-center justify-center gap-6 text-center">
        {data && data.length > 0 ? (
          <SwapCard pools={data} />
        ) : error && !isValidating ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-muted-foreground">
              Unable to load pools: {String(error.message ?? error)}
            </p>
            <Button variant="secondary" onClick={() => mutate()}>
              Retry
            </Button>
          </div>
        ) : (
          <Loader2 className="size-8 animate-spin" />
        )}
      </main>
    </WalletProvider>
  )
}
