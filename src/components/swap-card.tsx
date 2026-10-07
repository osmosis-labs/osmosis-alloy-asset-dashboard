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
  Info,
  Loader2,
  ShieldAlert,
  Snowflake,
  UserRound,
  WalletMinimal,
} from "lucide-react"
import { toast } from "sonner"
import useSWR from "swr"
import useSWRImmutable from "swr/immutable"

import { AssetWithDecimal } from "@/types/asset"
import { MinimalAssetPool } from "@/types/pool"
import { BlockExplorer } from "@/lib/block-explorer"
import { executeContract, swapExactAmountIn } from "@/lib/swap-msgs"
import {
  alloyContract,
  directSwapFromQuote,
  parseSwapAmount,
  QuoteInput,
  quoteMatches,
  toBaseAmount,
} from "@/lib/swap-amount"
import { describeSwapError, ErrorAsset } from "@/lib/swap-errors"
import { badgeVariants } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { DecimalSpan } from "@/components/decimal-span"

import { AssetShow } from "./asset-show"

// The pool the form opens on: the one named in the URL (?pool=), otherwise
// the first pool that is not frozen, so the form does not open on a pool
// whose swaps are all disabled.
const initialPool = (pools: MinimalAssetPool[], poolId?: string) =>
  pools.find((pool) => pool.id === poolId) ??
  pools.find((pool) => pool.status.isActive !== false) ??
  pools[0]

// Transaction hash with links to the explorer and the clipboard, for the
// success toasts.
const TxHashActions = ({ hash }: { hash: string }) => (
  <div className="inline-flex items-center gap-2">
    Tx Hash: {hash.slice(0, 6)}..{hash.slice(-4)}{" "}
    <a
      href={BlockExplorer.tx(hash)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="View transaction in the block explorer (opens in a new tab)"
    >
      <ExternalLink className="size-3" />
    </a>
    <button
      type="button"
      aria-label="Copy transaction hash"
      onClick={() => {
        navigator.clipboard
          .writeText(hash)
          .then(() => toast.success("Tx Hash Copied"))
      }}
    >
      <Copy className="size-3" />
    </button>
  </div>
)

const SwapCard = ({
  pools,
  initialPoolId,
}: {
  pools: MinimalAssetPool[]
  initialPoolId?: string
}) => {
  const [isForceExit, setIsForceExit] = useState(false)

  const { connect, openView, isWalletConnecting, address, signAndBroadcast } =
    useChain("osmosis")
  const [inAsset, setInAsset] = useState<[AssetWithDecimal, string]>(() => {
    const pool = initialPool(pools, initialPoolId)
    return [pool.assets![0], pool.id]
  })
  const [outAsset, setOutAsset] = useState<[AssetWithDecimal, string]>(() => {
    const pool = initialPool(pools, initialPoolId)
    return [pool.alloy.asset, pool.id]
  })
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

  // The balance request failed and there is no earlier result: the balance is
  // unknown, which must not read as zero.
  const isBalanceUnavailable = !!balance.error && !balance.data
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

  // null when the pool's price is unknown: the USD estimate is then not shown
  // rather than shown as $0.
  const inPrice = useMemo(() => {
    return pools.find((pool) => pool.id === inAsset[1])?.alloy.price ?? null
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
    return inPrice === null ? null : inAmount.multipliedBy(inPrice)
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

  // Every asset the form can show, for turning denoms and base amounts in
  // error messages into symbols and display amounts.
  const errorAssets: ErrorAsset[] = useMemo(
    () =>
      _.uniqBy(
        pools.flatMap((pool) => [...(pool.assets ?? []), pool.alloy.asset]),
        "denom"
      ),
    [pools]
  )

  const [isSwapping, setIsSwapping] = useState(false)
  const swap = async () => {
    setIsSwapping(true)
    try {
      if (!address) throw new Error("Wallet not connected")
      const quoted = assertQuoteCurrent()
      const amountIn = quoted.input.amountIn
      const { routes, minAmountOut } = directSwapFromQuote(
        quoted.quote,
        quoted.input
      )
      const msg = swapExactAmountIn({
        routes: routes.map((route) => ({
          poolId: BigInt(route.poolId),
          tokenOutDenom: route.tokenOutDenom,
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
          description: <TxHashActions hash={txId.transactionHash} />,
          duration: 6000,
        })
      } else {
        // @ts-ignore: rawLog is still valid for osmosis
        throw new Error(txId.rawLog)
      }
      console.log(txId)
    } catch (e: any) {
      toast.error("Swap Failed", {
        description: describeSwapError(String(e?.message ?? e), errorAssets, {
          in: inAsset[0],
          out: outAsset[0],
        }),
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
      const quoted = assertQuoteCurrent()
      // Output amount only; the pool and denoms are the form's own.
      const { minAmountOut } = directSwapFromQuote(quoted.quote, quoted.input)
      // Exits go to the selected pool's own contract: the input must be that
      // pool's alloyed denom, and the contract it names must be the pool's.
      const pool = pools.find((p) => p.id === inAsset[1])
      const contractAddress = alloyContract(inAsset[0].denom)
      if (
        !pool ||
        inAsset[0].denom !== pool.alloy.asset.denom ||
        !contractAddress ||
        contractAddress !== pool.contractAddress
      )
        throw new Error("Force Exit is only available from the pool's alloy")
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
          description: <TxHashActions hash={txId.transactionHash} />,
          duration: 6000,
        })
      } else {
        // @ts-ignore: rawLog is still valid for osmosis
        throw new Error(txId.rawLog)
      }
      console.log(txId)
    } catch (e: any) {
      toast.error("Force Exit Failed", {
        description: describeSwapError(String(e?.message ?? e), errorAssets, {
          in: inAsset[0],
          out: outAsset[0],
        }),
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
          <Switch
            checked={isForceExit}
            onCheckedChange={setIsForceExit}
            aria-label="Force Exit"
          />
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-1 text-sm font-semibold"
              >
                Force Exit
                <Info className="size-3 text-muted-foreground" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 space-y-2 text-xs">
              <p>
                Force Exit withdraws a variant directly through the alloy
                pool&apos;s smart contract, bypassing Osmosis routing.
              </p>
              <p>
                It only works while the pool is not frozen: a frozen pool&apos;s
                contract rejects exits.
              </p>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex-1" />
        {/* Connected: opens the wallet view, which can disconnect or switch. */}
        <Button
          onClick={address ? openView : connect}
          disabled={isWalletConnecting}
          className="self-end"
          size="sm"
          aria-label={address ? `Wallet ${address}` : undefined}
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
              isBalanceUnavailable ? (
                "unavailable"
              ) : balance.isValidating ? (
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
            <button
              type="button"
              className={badgeVariants({ variant: "secondary", size: "sm" })}
              aria-label={`Half of available ${inAsset[0].symbol}`}
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
            </button>
            <button
              type="button"
              className={badgeVariants({ variant: "secondary", size: "sm" })}
              aria-label={`All available ${inAsset[0].symbol}`}
              onClick={() => setShownInAmount(inBalance.toFixed())}
            >
              Max
            </button>
          </div>
        </div>
        <div className="relative grid gap-2">
          <div className="flex flex-col justify-between rounded-md border p-4 focus-within:ring-2 focus-within:ring-ring md:flex-row md:items-center md:gap-2">
            <AssetShow
              label="Token to swap"
              balance={balance.data}
              asset={inAsset[0]}
              onAssetChange={(asset, pool) => {
                if (pool.id !== inAsset[1]) {
                  const isAlloy = asset.denom === pool.alloy.asset.denom
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
              {/* The focus ring is drawn on the surrounding box instead. */}
              <Input
                className="ml-auto h-fit border-none p-0 text-right text-lg leading-none focus-visible:ring-transparent"
                value={shownInAmount}
                onChange={(e) => setShownInAmount(e.target.value)}
                inputMode="decimal"
                autoComplete="off"
                aria-label={`Amount of ${inAsset[0].symbol} to swap`}
              />
              {estimatedInPrice && (
                <DecimalSpan
                  className="text-xs leading-none text-muted-foreground"
                  mantissa={2}
                  dollar
                >
                  {estimatedInPrice.toString()}
                </DecimalSpan>
              )}
            </div>
          </div>
          <div className="flex flex-col justify-between rounded-md border p-4 md:flex-row md:items-center md:gap-2">
            <AssetShow
              label="Token to receive"
              balance={balance.data}
              asset={outAsset[0]}
              onAssetChange={(asset, pool) => setOutAsset([asset, pool.id])}
              open={isOutAssetSelectOpen}
              onOpenChange={setIsOutAssetSelectOpen}
              pools={pools.filter((pool) => pool.id === inAsset[1])}
              disabledDenoms={[inAsset[0].denom]}
            />
            <div aria-live="polite" className="text-end">
              {estimatedOut.isValidating || estimatedOut.error ? (
                <Skeleton className="ml-auto h-8 w-24" />
              ) : (
                estimatedOut.data && (
                  <>
                    <span className="sr-only">You receive </span>
                    {estimatedOut.data.amount.toString()}
                    <span className="sr-only"> {outAsset[0].symbol}</span>
                  </>
                )
              )}
            </div>
          </div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform">
            <Button
              size="icon-sm"
              className="group rounded-full"
              aria-label="Swap direction"
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
          ) : price.data?.in_base_out_quote_spot_price ? (
            <DecimalSpan mantissa={2}>
              {price.data.in_base_out_quote_spot_price}
            </DecimalSpan>
          ) : (
            "-"
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
          <div
            role="alert"
            className="break-words rounded-md bg-destructive p-1 text-xs font-medium text-destructive-foreground"
          >
            {describeSwapError(
              price.error?.message || estimatedOut.error?.message,
              errorAssets,
              { in: inAsset[0], out: outAsset[0] }
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
              isBalanceUnavailable ||
              estimatedOut.error ||
              !estimatedOut.data ||
              !isQuoteCurrent ||
              estimatedOut.data.amount.isZero() ||
              inBalance.isLessThan(inAmount) ||
              (isForceExit && !alloyContract(inAsset[0].denom))
            }
            onClick={isForceExit ? forceExit : swap}
            variant={isForceExit ? "destructive" : "default"}
          >
            {isSwapping && <Loader2 className="mr-2 size-4 animate-spin" />}
            {isPoolFrozen
              ? "Pool Frozen"
              : isInAssetCorrupted
                ? "Corrupted Asset Cannot Be Deposited"
                : isBalanceUnavailable
                  ? "Balance Unavailable"
                  : shownAmount === null
                    ? "Invalid Amount"
                    : inBalance.isLessThan(inAmount)
                      ? "Insufficient Balance"
                      : isForceExit && !alloyContract(inAsset[0].denom)
                        ? "Force Exit Only Available For Alloy Asset"
                        : isForceExit
                          ? "Force Exit"
                          : "Swap"}
          </Button>
        )}
      </div>
    </div>
  )
}
SwapCard.displayName = "SwapCard"

export { SwapCard }
