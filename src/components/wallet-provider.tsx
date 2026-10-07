import { ComponentProps, ReactNode, useEffect } from "react"
import { Registry } from "@cosmjs/proto-signing"
import { AminoTypes, defaultRegistryTypes, GasPrice } from "@cosmjs/stargate"
import { wallets as compass } from "@cosmos-kit/compass"
import { wallets as cosmostation } from "@cosmos-kit/cosmostation"
import { wallets as keplr } from "@cosmos-kit/keplr"
import { ChainProvider, useModalTheme } from "@cosmos-kit/react"
import { wallets as station } from "@cosmos-kit/station"
import { wallets as trust } from "@cosmos-kit/trust"
import { useTheme } from "next-themes"

import { env } from "@/env.mjs"
import { osmosisAssetList, osmosisChain } from "@/lib/osmosis-chain"
import { swapAminoConverters, swapProtoRegistry } from "@/lib/swap-msgs"

// chain-registry and cosmos-kit each pin a different @chain-registry/types
// release. The data is the same JSON, so only the declared types differ.
type Chains = ComponentProps<typeof ChainProvider>["chains"]
type AssetLists = ComponentProps<typeof ChainProvider>["assetLists"]

const WalletProvider = ({ children }: { children: ReactNode }) => {
  const { setModalTheme } = useModalTheme()
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (!resolvedTheme) return
    setModalTheme(resolvedTheme as "light" | "dark")
  }, [resolvedTheme])

  return (
    <ChainProvider
      chains={[osmosisChain] as unknown as Chains}
      assetLists={[osmosisAssetList] as unknown as AssetLists}
      wallets={[
        ...keplr,
        ...compass,
        ...cosmostation,
        ...station,
        ...trust,
      ]}
      walletConnectOptions={{
        signClient: {
          projectId: env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID,
        },
      }}
      signerOptions={{
        signingStargate: () => ({
          // osmojs is built against cosmjs 0.32 (cosmjs-types 0.9), cosmos-kit
          // signs with cosmjs 0.36 (cosmjs-types 0.10): the generated types
          // declare different BinaryWriter classes. The registry only calls
          // encode(message).finish(), decode and fromPartial on them, which
          // never mix writers across versions, so the cast is safe at runtime.
          registry: new Registry([
            ...defaultRegistryTypes,
            ...(swapProtoRegistry as unknown as typeof defaultRegistryTypes),
          ]),
          gasPrice: GasPrice.fromString("0.0025uosmo"),
          aminoTypes: new AminoTypes(swapAminoConverters),
        }),
      }}
      endpointOptions={{
        endpoints: {
          osmosis: {
            rpc: [
              { url: "https://rpc.osmosis.zone", headers: {}, isLazy: true },
            ],
            rest: [
              { url: "https://lcd.osmosis.zone", headers: {}, isLazy: true },
            ],
          },
        },
      }}
      throwErrors={false}
    >
      {children}
    </ChainProvider>
  )
}
WalletProvider.displayName = "WalletProvider"

export default WalletProvider
