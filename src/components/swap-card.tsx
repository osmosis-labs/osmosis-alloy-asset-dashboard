import { useEffect, useMemo, useReducer, useState } from "react"
import { POOL_STATUS } from "@/constants/status"
import { getUserAssets } from "@/services/asset"
import { getBaseDirectQuote, getDirectQuote } from "@/services/quote"
import { isDeliverTxSuccess } from "@cosmjs/stargate"
import { useChain } from "@cosmos-kit/react"
import BigNumber from "bignumber.js"
import _ from "lodash"
import {
  ArrowDown,
  ChevronsUpDown,
  Copy,
  ExternalLink,
  Loader2,
  ShieldAlert,
  Snowflake,
  UserRound,
  WalletMinimal,
} from "lucide-react"
import { cosmwasm, osmosis } from "osmojs"
import { toast } from "sonner"
import useSWR from "swr"
import useSWRImmutable from "swr/immutable"

import { AssetWithDecimal } from "@/types/asset"
import { MinimalAssetPool } from "@/types/pool"
import { BlockExplorer } from "@/lib/block-explorer"
import {
  parseSwapAmount,
  QuoteInput,
  quoteMatches,
  toBaseAmount,
} from "@/lib/swap-amount"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { DecimalSpan } from "@/components/decimal-span"

import { AssetShow } from "./asset-show"

const { swapExactAmountIn } =
  osmosis.poolmanager.v1beta1.MessageComposer.withTypeUrl
const { executeContract } = cosmwasm.wasm.v1.MessageComposer.withTypeUrl

const SwapCard = ({ pools }: { pools: MinimalAssetPool[] }) => {
  const [isForceExit, setIsForceExit] = useState(false)

  const { connect, isWalletConnecting, address, signAndBroadcast } =
    useChain("osmosis")
  const [inAsset, setInAsset] = useState<[AssetWithDecimal, string]>([
    pools[0].assets![0],
    pools[0].id,
  ] as const)
  const [outAsset, setOutAsset] = useState<[AssetWithDecimal, string]>([
    pools[0].alloy.asset,
    pools[0].id,
  ] as const)
  const [isInAssetSelectOpen, setIsInAssetSelectOpen] = useState(false)
  const [isOutAssetSelectOpen, setIsOutAssetSelectOpen] = useState(false)

  const price = useSWRImmutable(
    ["quote", inAsset[1], inAsset[0].denom, outAsset[0].denom],
    async ([, poolId, denomIn, denomOut]) => {
      const quote = await getBaseDirectQuote(poolId, denomIn, denomOut)
      if ("message" in quote) throw new Error(quote.message)
      return quote
    }
  )

  const balance = useSWR(
    ["balance", address],
    async ([, address]) => {
      if (!address) return
      const balance = await getUserAssets(address)
      return _.keyBy(balance, "denom")
    },
    {
      refreshInterval: 30000,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
    }
  )

  const inBalance = useMemo(() => {
    if (!balance.data) return new BigNumber(0)
    const asset = balance.data[inAsset[0].denom]
    return new BigNumber(asset?.amount || 0).shiftedBy(-inAsset[0].decimal)
  }, [balance.data, inAsset[0]])

  const [inAmount, setInAmount] = useReducer(
    (prevState: BigNumber, action: string) => {
      if (!action) return new BigNumber(0)
      const bn = new BigNumber(action, 10)
      if (bn.isNaN()) return prevState
      return bn
    },
    new BigNumber(0)
  )
  const debouncedSetInAmount = useMemo(() => _.debounce(setInAmount, 500), [])

  const [shownInAmount, setShownInAmount] = useState("0")
  useEffect(() => {
    debouncedSetInAmount(shownInAmount)
  }, [shownInAmount])

  // The visible amount, parsed now (null when it cannot be submitted as
  // shown). The quote follows the debounced amount, so a transaction may only
  // be built once a quote for exactly this amount and these denoms is in.
  const shownAmount = useMemo(
    () => parseSwapAmount(shownInAmount, inAsset[0].decimal),
    [shownInAmount, inAsset[0]]
  )
  const currentQuoteInput: QuoteInput | null = shownAmount
    ? {
        poolId: inAsset[1],
        denomIn: inAsset[0].denom,
        denomOut: outAsset[0].denom,
        amountIn: toBaseAmount(shownAmount, inAsset[0].decimal),
      }
    : null

  const inPrice = useMemo(() => {
    return pools.find((pool) => pool.id === inAsset[1])?.alloy.price || "0"
  }, [inAsset[1], pools])

  // Onchain state of the contract behind the selected pool. A frozen contract
  // rejects swaps in both directions and exit_pool, so both Swap and Force
  // Exit are blocked up front instead of failing at broadcast. Depositing a
  // corrupted constituent is rejected by the contract as well (its amount may
  // never increase), so that direction is blocked too; taking it out stays
  // allowed.
  const selectedPoolStatus = useMemo(
    () => pools.find((pool) => pool.id === inAsset[1])?.status,
    [inAsset[1], pools]
  )
  const isPoolFrozen = selectedPoolStatus?.isActive === false
  const isInAssetCorrupted =
    selectedPoolStatus?.corruptedDenoms?.includes(inAsset[0].denom) ?? false

  const estimatedInPrice = useMemo(() => {
    return inAmount.multipliedBy(inPrice)
  }, [inPrice, inAmount])

  const estimatedOut = useSWRImmutable(
    ["quote-out", inAsset[1], inAsset[0].denom, outAsset[0].denom, inAmount],
    async ([, poolId, denomIn, denomOut]) => {
      if (inAmount.isZero()) return
      const ina = inAmount.shiftedBy(inAsset[0].decimal).toFixed(0)
      const quote = await getDirectQuote(poolId, ina, denomIn, denomOut)
      if ("message" in quote) throw new Error(quote.message)
      const amount = new BigNumber(quote.amount_out).shiftedBy(
        -outAsset[0].decimal
      )
      // What this quote was fetched for, checked against the visible input
      // before any transaction is built from it.
      const input: QuoteInput = { poolId, denomIn, denomOut, amountIn: ina }
      return {
        amount,
        quote,
        input,
      }
    },
    {
      refreshInterval: 30000,
    }
  )

  const isQuoteCurrent = quoteMatches(
    estimatedOut.data?.input,
    currentQuoteInput
  )

  // Re-checked at submission (the handlers close over this render's input):
  // the visible amount must parse and match the quote the transaction is
  // built from.
  const assertQuoteCurrent = () => {
    if (
      !estimatedOut.data ||
      !quoteMatches(estimatedOut.data.input, currentQuoteInput)
    ) {
      throw new Error("The amount changed. Wait for the quote to update.")
    }
    return estimatedOut.data
  }

  const [isSwapping, setIsSwapping] = useState(false)
  const swap = async () => {
    setIsSwapping(true)
    try {
      if (!address) throw new Error("Wallet not connected")
      const quoted = assertQuoteCurrent()
      const amountIn = quoted.input.amountIn
      const minAmountOut = quoted.quote.amount_out
      const msg = swapExactAmountIn({
        routes: quoted.quote.route[0].pools.map((pool) => ({
          poolId: BigInt(pool.id),
          tokenOutDenom: pool.token_out_denom,
        })),
        sender: address,
        tokenOutMinAmount: minAmountOut,
        tokenIn: {
          amount: amountIn,
          denom: inAsset[0].denom,
        },
      })
      const txId = await signAndBroadcast([msg])
      if (isDeliverTxSuccess(txId)) {
        balance.mutate()
        toast.success("Swap Success", {
          description: (
            <div className="inline-flex items-center gap-2">
              Tx Hash: {txId.transactionHash.slice(0, 6)}..
              {txId.transactionHash.slice(-4)}{" "}
              <ExternalLink
                className="size-3 cursor-pointer"
                onClick={() => {
                  window.open(BlockExplorer.tx(txId.transactionHash), "_blank")
                }}
              />
              <Copy
                className="size-3 cursor-pointer"
                onClick={() => {
                  navigator.clipboard
                    .writeText(txId.transactionHash)
                    .then(() => toast.success("Tx Hash Copied"))
                }}
              />
            </div>
          ),
          duration: 6000,
        })
      } else {
        // @ts-ignore: rawLog is still valid for osmosis
        throw new Error(txId.rawLog)
      }
      console.log(txId)
    } catch (e: any) {
      toast.error("Swap Failed", {
        description: e.message,
      })
      console.error(e)
    } finally {
      setIsSwapping(false)
    }
  }

  const forceExit = async () => {
    setIsSwapping(true)
    try {
      if (!address) throw new Error("Wallet not connected")
      const minAmountOut = assertQuoteCurrent().quote.amount_out
      if (!inAsset[0].denom.includes("alloy"))
        throw new Error("Invalid alloy asset")
      const contractAddress = inAsset[0].denom.split("/")[1]
      const msg = executeContract({
        contract: contractAddress,
        sender: address,
        funds: [],
        msg: Uint8Array.from(
          Buffer.from(
            JSON.stringify({
              exit_pool: {
                tokens_out: [
                  {
                    denom: outAsset[0].denom,
                    amount: minAmountOut,
                  },
                ],
              },
            })
          )
        ),
      })
      const txId = await signAndBroadcast([msg])
      if (isDeliverTxSuccess(txId)) {
        balance.mutate()
        toast.success("Force Exit Success", {
          description: (
            <div className="inline-flex items-center gap-2">
              Tx Hash: {txId.transactionHash.slice(0, 6)}..
              {txId.transactionHash.slice(-4)}{" "}
              <ExternalLink
                className="size-3 cursor-pointer"
                onClick={() => {
                  window.open(BlockExplorer.tx(txId.transactionHash), "_blank")
                }}
              />
              <Copy
                className="size-3 cursor-pointer"
                onClick={() => {
                  navigator.clipboard
                    .writeText(txId.transactionHash)
                    .then(() => toast.success("Tx Hash Copied"))
                }}
              />
            </div>
          ),
          duration: 6000,
        })
      } else {
        // @ts-ignore: rawLog is still valid for osmosis
        throw new Error(txId.rawLog)
      }
      console.log(txId)
    } catch (e: any) {
      toast.error("Force Exit Failed", {
        description: e.message,
      })
      console.error(e)
    } finally {
      setIsSwapping(false)
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 md:w-auto">
      <div className="flex w-full items-center">
        <div className="flex items-center gap-2">
          <Switch checked={isForceExit} onCheckedChange={setIsForceExit} />
          <div className="text-sm font-semibold">Force Exit</div>
        </div>
        <div className="flex-1" />
        <Button
          onClick={connect}
          disabled={isWalletConnecting}
          className="self-end"
          size="sm"
        >
          {isWalletConnecting && (
            <Loader2 className="mr-2 size-4 animate-spin" />
          )}
          {address ? (
            <>
              {address.slice(0, 10)}... <UserRound className="ml-2 size-4" />
            </>
          ) : (
            <>
              Connect Wallet <WalletMinimal className="ml-2 size-4" />
            </>
          )}
        </Button>
      </div>
      <div className="flex w-full flex-col gap-2 rounded-md border p-4 text-start md:w-[500px]">
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <div className="inline-flex items-center gap-1 text-sm">
            <span className="text-muted-foreground">Available</span>{" "}
            {address ? (
              balance.isValidating ? (
                <Skeleton className="h-4 w-6" />
              ) : (
                inBalance.precision(4).toString()
              )
            ) : (
              "-"
            )}{" "}
            <span className="font-mono">{inAsset[0].symbol}</span>
          </div>
          <div className="flex gap-1">
            <Badge
              variant="secondary"
              size="sm"
              onClick={() =>
                // Exact half, in plain notation (toPrecision gave "1.235e+4"
                // for large balances, which the amount parser rejects).
                setShownInAmount(
                  inBalance
                    .div(2)
                    .decimalPlaces(inAsset[0].decimal, BigNumber.ROUND_DOWN)
                    .toFixed()
                )
              }
            >
              Half
            </Badge>
            <Badge
              variant="secondary"
              size="sm"
              onClick={() => setShownInAmount(inBalance.toFixed())}
            >
              Max
            </Badge>
          </div>
        </div>
        <div className="relative grid gap-2">
          <div className="flex flex-col justify-between rounded-md border p-4 md:flex-row md:items-center md:gap-2">
            <AssetShow
              balance={balance.data}
              asset={inAsset[0]}
              onAssetChange={(asset, pool) => {
                if (pool.id !== inAsset[1]) {
                  const isAlloy = asset.denom.includes("alloy")
                  setOutAsset([
                    isAlloy ? pool.assets![0] : pool.alloy.asset,
                    pool.id,
                  ])
                  setInAmount("0")
                }
                setInAsset([asset, pool.id])
              }}
              open={isInAssetSelectOpen}
              onOpenChange={setIsInAssetSelectOpen}
              pools={pools}
              disabledDenoms={
                isForceExit
                  ? _.chain(pools).map("assets").flatten().map("denom").value()
                  : [outAsset[0].denom]
              }
            />
            <div className="self-end text-end">
              <Input
                className="ml-auto h-fit border-none p-0 text-right text-lg leading-none focus-visible:ring-transparent"
                value={shownInAmount}
                onChange={(e) => setShownInAmount(e.target.value)}
              />
              <DecimalSpan
                className="text-xs leading-none text-muted-foreground"
                mantissa={2}
                dollar
              >
                {estimatedInPrice.toString()}
              </DecimalSpan>
            </div>
          </div>
          <div className="flex flex-col justify-between rounded-md border p-4 md:flex-row md:items-center md:gap-2">
            <AssetShow
              balance={balance.data}
              asset={outAsset[0]}
              onAssetChange={(asset, pool) => setOutAsset([asset, pool.id])}
              open={isOutAssetSelectOpen}
              onOpenChange={setIsOutAssetSelectOpen}
              pools={pools.filter((pool) => pool.id === inAsset[1])}
              disabledDenoms={[inAsset[0].denom]}
            />
            {estimatedOut.isValidating || estimatedOut.error ? (
              <Skeleton className="ml-auto h-8 w-24" />
            ) : (
              <div className="text-end">
                {estimatedOut.data?.amount.toString()}
              </div>
            )}
          </div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform">
            <Button
              size="icon-sm"
              className="group rounded-full"
              onClick={() => {
                setInAsset(outAsset)
                setOutAsset(inAsset)
              }}
            >
              <ChevronsUpDown className="hidden size-4 group-hover:block" />
              <ArrowDown className="size-4 group-hover:hidden" />
            </Button>
          </div>
        </div>
        <div className="inline-flex items-center gap-1 text-sm">
          1 <span className="font-mono">{inAsset[0].symbol}</span> ≈
          {price.isValidating || price.error ? (
            <Skeleton className="h-4 w-6" />
          ) : (
            <DecimalSpan mantissa={2}>
              {price.data?.in_base_out_quote_spot_price || "0"}
            </DecimalSpan>
          )}
          <span className="font-mono">{outAsset[0].symbol}</span>
        </div>
        {isPoolFrozen && (
          <div className="flex items-start gap-2 rounded-md bg-destructive p-2 text-xs font-medium text-destructive-foreground">
            <Snowflake className="mt-0.5 size-3 shrink-0" />
            <span>
              <span className="font-semibold">{POOL_STATUS.frozen.title}.</span>{" "}
              {POOL_STATUS.frozen.description}
            </span>
          </div>
        )}
        {!isPoolFrozen && isInAssetCorrupted && (
          <div className="flex items-start gap-2 rounded-md bg-destructive p-2 text-xs font-medium text-destructive-foreground">
            <ShieldAlert className="mt-0.5 size-3 shrink-0" />
            <span>
              <span className="font-semibold">
                {POOL_STATUS.corrupted.title}.
              </span>{" "}
              <span className="font-mono">{inAsset[0].symbol}</span> is marked
              corrupted in this pool and cannot be deposited into it. It can
              only be taken out.
            </span>
          </div>
        )}
        {(price.error?.message || estimatedOut.error?.message) && (
          <div className="break-all rounded-md bg-destructive p-1 text-xs font-medium text-destructive-foreground opacity-70">
            {(price.error?.message || estimatedOut.error?.message)?.replace(
              `(${outAsset[0].denom})`,
              outAsset[0].symbol
            )}
          </div>
        )}
        {!address ? (
          <Button onClick={connect}>
            Connect Wallet
            <WalletMinimal className="ml-2 size-4" />
          </Button>
        ) : (
          <Button
            disabled={
              isSwapping ||
              isPoolFrozen ||
              isInAssetCorrupted ||
              estimatedOut.error ||
              !estimatedOut.data ||
              !isQuoteCurrent ||
              estimatedOut.data.amount.isZero() ||
              inBalance.isLessThan(inAmount) ||
              (isForceExit && !inAsset[0].denom.includes("alloy"))
            }
            onClick={isForceExit ? forceExit : swap}
            variant={isForceExit ? "destructive" : "default"}
          >
            {isSwapping && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isPoolFrozen
              ? "Pool Frozen"
              : isInAssetCorrupted
                ? "Corrupted Asset Cannot Be Deposited"
                : shownAmount === null
                  ? "Invalid Amount"
                  : inBalance.isLessThan(inAmount)
                    ? "Insufficient Balance"
                    : isForceExit && !inAsset[0].denom.includes("alloy")
                      ? "Force Exit Only Available For Alloy Asset"
                      : isForceExit
                        ? "Force Exit"
                        : "Swap"}
          </Button>
        )}
        {isForceExit && (
          <div className="text-xs font-semibold text-muted-foreground">
            *Force Exit is a feature that allows you to exit the pool through
            the alloy pool&apos;s smart contract, bypassing the Osmosis routing
            mechanism.
          </div>
        )}
      </div>
      <div className="max-w-[300px] self-center text-xs text-muted-foreground">
        *This only routes through alloy pool which should swap 1:1, depending on
        liquidity of the assets in the pool.
      </div>
    </div>
  )
}
SwapCard.displayName = "SwapCard"

export { SwapCard }
