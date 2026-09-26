// Tests for the swap form's error descriptions.
//
//   node scripts/test-swap-errors.mts
import assert from "node:assert/strict"
import path from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"

const { describeSwapError, unwrapErrorMessage } = await import(
  pathToFileURL(path.resolve("src/lib/swap-errors.ts")).href
)

const usdtAtom = { denom: "ibc/USDTATOM", symbol: "USDT.eth.atom", decimal: 6 }
const allUsdt = {
  denom: "factory/osmo1x/alloyed/allUSDT",
  symbol: "allUSDT",
  decimal: 6,
}
const assets = [usdtAtom, allUsdt]

// Chain errors reach the wallet wrapped in the message path, e.g.:
const wrapped = (inner: string) =>
  `failed to execute message; message index: 0: dispatch: submessages: ${inner}: execute wasm contract failed`

test("JSON error bodies are unwrapped", () => {
  assert.equal(unwrapErrorMessage('{"message":"boom"}'), "boom")
  assert.equal(unwrapErrorMessage("plain text"), "plain text")
  assert.equal(unwrapErrorMessage('{"code":3}'), '{"code":3}')
})

test("SQS pool shortfall, raw form with the denom in parentheses", () => {
  const raw =
    '{"message":"insufficient balance of token (ibc/USDTATOM), balance (2700332), amount (10000000)"}'
  assert.equal(
    describeSwapError(raw, assets),
    "The pool only holds 2.700332 USDT.eth.atom, and this swap needs 10. Try a smaller amount or another variant."
  )
})

test("SQS pool shortfall naming the token by symbol", () => {
  const raw =
    '{"message":"insufficient balance of token USDT.eth.atom, balance (2700332), amount (10000000)"}'
  assert.match(
    describeSwapError(raw, assets),
    /only holds 2\.700332 USDT\.eth\.atom/
  )
})

test("unfamiliar token symbol falls back to the quoted output asset", () => {
  const raw =
    "insufficient balance of token USDT, balance (1500000), amount (2000000)"
  assert.match(
    describeSwapError(raw, assets, { out: usdtAtom }),
    /only holds 1\.5 USDT\.eth\.atom, and this swap needs 2\./
  )
  assert.equal(
    describeSwapError(raw, assets),
    "The pool does not hold enough USDT for this swap."
  )
})

test("transmuter pool shortfall in a failed transaction", () => {
  const raw = wrapped(
    "Insufficient pool asset: required: 10000000ibc/USDTATOM, available: 2700332ibc/USDTATOM"
  )
  assert.match(
    describeSwapError(raw, assets),
    /only holds 2\.700332 USDT\.eth\.atom, and this swap needs 10\./
  )
})

test("frozen pool", () => {
  assert.equal(
    describeSwapError(wrapped("The pool is currently inactive"), assets),
    "This pool is frozen: swaps and Force Exit are disabled until it is reactivated."
  )
})

const usdtAxl = { denom: "ibc/USDTAXL", symbol: "USDT.eth.axl", decimal: 6 }
const corruptedErr = wrapped(
  "Corrupted asset: ibc/USDTATOM must not increase in amount or weight"
)

test("corrupted asset: depositing it", () => {
  assert.equal(
    describeSwapError(corruptedErr, [...assets, usdtAxl], {
      in: usdtAtom,
      out: allUsdt,
    }),
    "USDT.eth.atom is marked as corrupted in this pool: it can only be taken out, not deposited."
  )
})

test("corrupted asset: taking out another variant raises its share", () => {
  // Burning allUSDT for USDT.eth.axl (a swap or a Force Exit) shrinks the
  // pool, so the corrupted variant's weight goes up.
  assert.equal(
    describeSwapError(corruptedErr, [...assets, usdtAxl], {
      in: allUsdt,
      out: usdtAxl,
    }),
    "USDT.eth.atom is marked as corrupted in this pool, and its share of the pool must not grow. Taking out USDT.eth.axl would increase it: take out USDT.eth.atom instead."
  )
})

test("corrupted asset without swap context", () => {
  assert.match(
    describeSwapError(corruptedErr, assets),
    /share of the pool must not grow\. This would increase it/
  )
})

test("rate limiter, transmuter and SQS forms", () => {
  const expected =
    "This swap would take USDT.eth.atom to 62% of the pool, above its 50% limit. Try a smaller amount."
  assert.equal(
    describeSwapError(
      wrapped(
        "Upper limit exceeded for `ibc/USDTATOM`, upper limit is 0.5, but the resulted weight is 0.620000000000000000"
      ),
      assets
    ),
    expected
  )
  assert.equal(
    describeSwapError(
      '{"message":"invalid upper limit (0.500000000000000000) for weight (0.62) and denom (ibc/USDTATOM)"}',
      assets
    ),
    expected
  )
})

test("wallet insufficient funds from a failed transaction", () => {
  const raw =
    "failed to execute message; message index: 0: spendable balance 2700332ibc/USDTATOM is smaller than 10000000ibc/USDTATOM: insufficient funds"
  assert.equal(
    describeSwapError(raw, assets),
    "Insufficient USDT.eth.atom: the wallet has 2.700332, and the transaction needs 10."
  )
})

test("other messages keep their text with denoms as symbols", () => {
  assert.equal(
    describeSwapError(
      '{"message":"no route for factory/osmo1x/alloyed/allUSDT"}',
      assets
    ),
    "no route for allUSDT"
  )
})
