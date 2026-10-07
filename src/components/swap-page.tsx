import "@interchain-ui/react/styles"
import "@/styles/wallet.css"

import { getAssetListUncached } from "@/services/asset"
import { getPoolsFromAPI } from "@/services/pools-api"
import _ from "lodash"
import { Loader2 } from "lucide-react"
import useSWRImmutable from "swr/immutable"

import { buildSwapPools } from "@/lib/swap-pools"
import { Button } from "@/components/ui/button"

import { SwapCard } from "./swap-card"
import WalletProvider from "./wallet-provider"

// The swap form and its data. Client-only: the pools and the assetlist are
// fetched in the browser, and the wallet provider needs window.
export function SwapPage({ initialPoolId }: { initialPoolId?: string }) {
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
      {/* Sits directly under the page heading, not centred in the space
          left below it. */}
      <div className="flex w-full flex-col items-center gap-6">
        {data && data.length > 0 ? (
          <SwapCard pools={data} initialPoolId={initialPoolId} />
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
          <div role="status">
            <Loader2 className="size-8 animate-spin" />
            <span className="sr-only">Loading pools</span>
          </div>
        )}
      </div>
    </WalletProvider>
  )
}
