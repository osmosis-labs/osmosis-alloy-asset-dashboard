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

// A readable version of a quote or transaction error for the swap form:
// amounts in display units with symbols instead of base units and denoms.
// `quotedOut` is the asset the quote pays out, the only one a pool can run
// short of, used when the error names a token by an unfamiliar symbol.
export const describeSwapError = (
  raw: string,
  assets: ErrorAsset[],
  quotedOut?: ErrorAsset
): string => {
  const message = unwrapErrorMessage(raw)
  const find = (token: string) =>
    assets.find((a) => a.symbol === token || a.denom === token)

  // SQS quote: the pool's reserve of the output token cannot cover the swap,
  // e.g. "insufficient balance of token USDT.eth.atom, balance (2700332),
  // amount (10000000)".
  const pool = message.match(
    /insufficient balance of token (\S+?),? balance \((\d+)\),? amount \((\d+)\)/i
  )
  if (pool) {
    const [, token, balance, amount] = pool
    const asset = find(token) ?? quotedOut
    if (!asset) return `The pool does not hold enough ${token} for this swap.`
    return (
      `The pool only holds ${displayAmount(balance, asset)} ${asset.symbol}, ` +
      `and this swap needs ${displayAmount(amount, asset)}. ` +
      `Try a smaller amount or another variant.`
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
