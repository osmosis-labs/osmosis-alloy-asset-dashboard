import BigNumber from "bignumber.js"

// Parses the amount typed into the swap form. Returns null for anything that
// cannot be submitted exactly as shown: not a plain non-negative decimal, or
// more decimal places than the asset has (it would be rounded silently).
// Empty input is zero.
export const parseSwapAmount = (
  text: string,
  decimals: number
): BigNumber | null => {
  const trimmed = text.trim()
  if (trimmed === "") return new BigNumber(0)
  if (!/^(\d+\.?\d*|\.\d+)$/.test(trimmed)) return null
  const amount = new BigNumber(trimmed, 10)
  if (amount.isNaN() || amount.isNegative()) return null
  if ((amount.decimalPlaces() ?? 0) > decimals) return null
  return amount
}

// Display amount to the base-unit integer string sent onchain.
export const toBaseAmount = (amount: BigNumber, decimals: number) =>
  amount.shiftedBy(decimals).toFixed(0)

export type QuoteInput = {
  poolId: string
  denomIn: string
  denomOut: string
  amountIn: string // base units
}

// Whether a quote was fetched for exactly this input. A transaction must only
// be built from a quote for the amount and denoms currently on screen.
export const quoteMatches = (
  quote: QuoteInput | undefined,
  current: QuoteInput | null
) =>
  !!quote &&
  !!current &&
  quote.poolId === current.poolId &&
  quote.denomIn === current.denomIn &&
  quote.denomOut === current.denomOut &&
  quote.amountIn === current.amountIn

// The parts of an SQS direct quote a swap transaction is built from.
export type DirectQuote = {
  amount_in: { denom: string; amount: string }
  amount_out: string
  route: { pools: { id: number | string; token_out_denom: string }[] }[]
}

// The route and minimum output of a direct swap through `input.poolId`,
// built from what the form selected rather than taken from the quote. SQS
// only supplies the output amount, and its answer must describe exactly the
// requested swap: one route of one hop, through the selected pool, from the
// selected input denom and amount to the selected output denom. Anything else
// (a misbehaving or compromised quote service routing through another pool,
// or into another token) throws before anything is signed.
export const directSwapFromQuote = (quote: DirectQuote, input: QuoteInput) => {
  const hops = quote.route?.length === 1 ? quote.route[0].pools : []
  const matches =
    hops.length === 1 &&
    String(hops[0].id) === input.poolId &&
    hops[0].token_out_denom === input.denomOut &&
    quote.amount_in?.denom === input.denomIn &&
    quote.amount_in?.amount === input.amountIn &&
    /^[1-9]\d*$/.test(quote.amount_out ?? "")
  if (!matches) {
    throw new Error(
      "The quote does not match the selected pool and assets. Refresh the page and try again."
    )
  }
  return {
    routes: [{ poolId: input.poolId, tokenOutDenom: input.denomOut }],
    minAmountOut: quote.amount_out,
  }
}

// The transmuter contract that issues an alloyed denom
// (factory/{contract}/alloyed/{subdenom}), or null for any other denom.
export const alloyContract = (denom: string) =>
  /^factory\/(osmo1[02-9ac-hj-np-z]+)\/alloyed\/[^/]+$/.exec(denom)?.[1] ?? null
