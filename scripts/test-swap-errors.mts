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

test("JSON error bodies are unwrapped", () => {
  assert.equal(unwrapErrorMessage('{"message":"boom"}'), "boom")
  assert.equal(unwrapErrorMessage("plain text"), "plain text")
  assert.equal(unwrapErrorMessage('{"code":3}'), '{"code":3}')
})

test("pool liquidity error is shown in display units", () => {
  const raw =
    '{"message":"insufficient balance of token USDT.eth.atom, balance (2700332), amount (10000000)"}'
  assert.equal(
    describeSwapError(raw, assets),
    "The pool only holds 2.700332 USDT.eth.atom, and this swap needs 10. Try a smaller amount or another variant."
  )
})

test("unfamiliar token symbol falls back to the quoted output asset", () => {
  const raw =
    "insufficient balance of token USDT, balance (1500000), amount (2000000)"
  assert.match(
    describeSwapError(raw, assets, usdtAtom),
    /only holds 1\.5 USDT\.eth\.atom, and this swap needs 2\./
  )
  assert.equal(
    describeSwapError(raw, assets),
    "The pool does not hold enough USDT for this swap."
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
