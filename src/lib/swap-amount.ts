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
