"use client"

import { ComponentProps, ReactNode, useEffect, useMemo } from "react"
import { Registry } from "@cosmjs/proto-signing"
import { AminoTypes, defaultRegistryTypes, GasPrice } from "@cosmjs/stargate"
import { wallets as compass } from "@cosmos-kit/compass"
import { wallets as cosmostation } from "@cosmos-kit/cosmostation"
import { wallets as keplr } from "@cosmos-kit/keplr"
import { wallets as leap } from "@cosmos-kit/leap"
import { ChainProvider, useModalTheme } from "@cosmos-kit/react"
import { wallets as station } from "@cosmos-kit/station"
import { wallets as trust } from "@cosmos-kit/trust"
import { assets, chains } from "chain-registry"
import { useTheme } from "next-themes"
import {
  cosmwasmAminoConverters,
  cosmwasmProtoRegistry,
  osmosisAminoConverters,
  osmosisProtoRegistry,
} from "osmojs"

import { env } from "@/env.mjs"

const WalletProvider = ({ children }: { children: ReactNode }) => {
  const { osmosisAsset, osmosisChain } = useMemo(() => {
    const osmosisChain = chains.filter(
      (chain) => chain.chain_name === "osmosis"
    )
    const osmosisAsset = assets.filter(
      (asset) => asset.chain_name === "osmosis"
    )

    // chain-registry and cosmos-kit each pin a different
    // @chain-registry/types release; the data is the same JSON, so only the
    // declared types differ.
    type Chains = ComponentProps<typeof ChainProvider>["chains"]
    type AssetLists = ComponentProps<typeof ChainProvider>["assetLists"]
    return {
      osmosisChain: osmosisChain as unknown as Chains,
      osmosisAsset: osmosisAsset as unknown as AssetLists,
    }
  }, [])

  const { setModalTheme } = useModalTheme()
  const { resolvedTheme } = useTheme()

  useEffect(() => {
    if (!resolvedTheme) return
    setModalTheme(resolvedTheme as "light" | "dark")
  }, [resolvedTheme])

  return (
    <ChainProvider
      chains={osmosisChain}
      assetLists={osmosisAsset}
      wallets={[
        ...keplr,
        ...leap,
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
            ...(osmosisProtoRegistry as unknown as typeof defaultRegistryTypes),
            ...(cosmwasmProtoRegistry as unknown as typeof defaultRegistryTypes),
          ]),
          gasPrice: GasPrice.fromString("0.0025uosmo"),
          aminoTypes: new AminoTypes({
            ...osmosisAminoConverters,
            ...cosmwasmAminoConverters,
          }),
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
