import BigNumber from "bignumber.js"

export type ErrorAsset = { denom: string; symbol: string; decimal: number }

// Error text from SQS and the chain arrives as JSON bodies such as
// {"message": "..."}; take the message out (a few levels deep at most).
export const unwrapErrorMessage = (raw: string): string => {
  let text = raw.trim()
  for (let depth = 0; depth < 3; depth++) {
    try {
      const parsed = JSON.parse(text)
      const message = parsed?.message ?? parsed?.error ?? parsed?.msg
      if (typeof message !== "string") break
      text = message.trim()
    } catch {
      break
    }
  }
  return text
}

const displayAmount = (base: string, asset: ErrorAsset) =>
  new BigNumber(base).shiftedBy(-asset.decimal).toFormat()

// Pool weights arrive as decimals ("0.62"); show them as percentages.
const percent = (weight: string) =>
  `${new BigNumber(weight).times(100).decimalPlaces(2).toFormat()}%`

// A denom or coin denom as written in an error: bare, in parentheses or in
// backticks.
const DENOM = String.raw`[(\x60]?([a-zA-Z][^\s,()\x60]*)[)\x60]?`

// The swap the error came from: what goes into the pool and what comes out.
export type SwapContext = { in?: ErrorAsset; out?: ErrorAsset }

// A readable version of a quote or transaction error for the swap form:
// amounts in display units with symbols instead of base units and denoms.
// `swap.out` is the only token a pool can run short of, used when a shortfall
// names a token by an unfamiliar symbol; `swap.in` tells a corrupted-asset
// deposit apart from a withdrawal that raises a corrupted asset's share.
//
// Covers the transmuter's (v3.2) errors for frozen pools, corrupted assets,
// pool shortfalls and rate limiters as they surface in a failed transaction,
// and SQS's quote-time equivalents.
export const describeSwapError = (
  raw: string,
  assets: ErrorAsset[],
  swap: SwapContext = {}
): string => {
  const message = unwrapErrorMessage(raw)
  const find = (token: string) =>
    assets.find((a) => a.symbol === token || a.denom === token)
  const label = (token: string) => find(token)?.symbol ?? token

  // Frozen pool (transmuter InactivePool): every swap and exit is rejected.
  if (/the pool is currently inactive/i.test(message)) {
    return "This pool is frozen: swaps and Force Exit are disabled until it is reactivated."
  }

  // Corrupted asset (transmuter CorruptedAssetRelativelyIncreased): neither
  // its amount nor its share of the pool may grow. Depositing it raises the
  // amount; taking out any other variant shrinks the pool and so raises its
  // share.
  const corrupted = message.match(
    new RegExp(`corrupted asset: ${DENOM} must not increase`, "i")
  )
  if (corrupted) {
    const token = corrupted[1]
    const name = label(token)
    const isDeposit =
      !!swap.in && (swap.in.denom === token || swap.in.symbol === token)
    if (isDeposit) {
      return `${name} is marked as corrupted in this pool: it can only be taken out, not deposited.`
    }
    const taking = swap.out ? `Taking out ${swap.out.symbol}` : "This"
    return (
      `${name} is marked as corrupted in this pool, and its share of the ` +
      `pool must not grow. ${taking} would increase it: take out ${name} ` +
      `instead.`
    )
  }

  // Pool shortfall. SQS quote: "insufficient balance of token (ibc/...),
  // balance (2700332), amount (10000000)"; transmuter: "Insufficient pool
  // asset: required: 10000000ibc/..., available: 2700332ibc/...".
  const quoteShortfall = message.match(
    new RegExp(
      String.raw`insufficient balance of token ${DENOM},? balance \((\d+)\),? amount \((\d+)\)`,
      "i"
    )
  )
  const txShortfall = message.match(
    /insufficient pool asset: required: (\d+)([a-zA-Z][\w/.:-]*), available: (\d+)[a-zA-Z][\w/.:-]*/i
  )
  if (quoteShortfall || txShortfall) {
    const [token, balance, amount] = quoteShortfall
      ? [quoteShortfall[1], quoteShortfall[2], quoteShortfall[3]]
      : [txShortfall![2], txShortfall![3], txShortfall![1]]
    const asset = find(token) ?? swap.out
    if (!asset) return `The pool does not hold enough ${token} for this swap.`
    return (
      `The pool only holds ${displayAmount(balance, asset)} ${asset.symbol}, ` +
      `and this swap needs ${displayAmount(amount, asset)}. ` +
      `Try a smaller amount or another variant.`
    )
  }

  // Rate limiter. Transmuter: "Upper limit exceeded for `ibc/...`, upper
  // limit is 0.5, but the resulted weight is 0.62"; SQS: "invalid upper limit
  // (0.5) for weight (0.62) and denom (ibc/...)".
  const txLimit = message.match(
    new RegExp(
      String.raw`upper limit exceeded for ${DENOM},? upper limit is ([\d.]+),? but the resulted weight is ([\d.]+)`,
      "i"
    )
  )
  const quoteLimit = message.match(
    new RegExp(
      String.raw`invalid upper limit \(([\d.]+)\) for weight \(([\d.]+)\) and denom ${DENOM}`,
      "i"
    )
  )
  if (txLimit || quoteLimit) {
    const [token, limit, weight] = txLimit
      ? [txLimit[1], txLimit[2], txLimit[3]]
      : [quoteLimit![3], quoteLimit![1], quoteLimit![2]]
    return (
      `This swap would take ${label(token)} to ${percent(weight)} of the ` +
      `pool, above its ${percent(limit)} limit. Try a smaller amount.`
    )
  }

  // Failed transaction, bank module: "2700332ibc/ABC is smaller than
  // 10000000ibc/ABC: insufficient funds".
  const funds = message.match(
    /(\d+)([a-zA-Z][\w/.:-]*) is smaller than (\d+)([a-zA-Z][\w/.:-]*)/
  )
  if (funds && /insufficient funds/i.test(message)) {
    const [, have, denom, need] = funds
    const asset = find(denom)
    if (asset) {
      return (
        `Insufficient ${asset.symbol}: the wallet has ` +
        `${displayAmount(have, asset)}, and the transaction needs ` +
        `${displayAmount(need, asset)}.`
      )
    }
  }

  // Anything else: the message as is, with known denoms shown as symbols
  // (longest first, so no denom is replaced inside a longer one).
  return [...assets]
    .sort((a, b) => b.denom.length - a.denom.length)
    .reduce((text, a) => text.split(a.denom).join(a.symbol), message)
}
