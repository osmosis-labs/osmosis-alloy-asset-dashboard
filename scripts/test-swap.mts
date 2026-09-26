// Tests for the swap form's amount parsing and quote binding.
//
//   node scripts/test-swap.mts
import assert from "node:assert/strict"
import path from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"

const { parseSwapAmount, toBaseAmount, quoteMatches } = await import(
  pathToFileURL(path.resolve("src/lib/swap-amount.ts")).href
)

test("plain decimals parse; empty is zero", () => {
  assert.equal(parseSwapAmount("1.5", 6).toString(), "1.5")
  assert.equal(parseSwapAmount(".5", 6).toString(), "0.5")
  assert.equal(parseSwapAmount("2.", 6).toString(), "2")
  assert.equal(parseSwapAmount("", 6).toString(), "0")
})

test("invalid text is rejected instead of keeping an old amount", () => {
  for (const text of ["invalid", "1,000", "-1", "1e3", ".", "1.2.3", "0x10"]) {
    assert.equal(parseSwapAmount(text, 6), null, text)
  }
})

test("more decimals than the asset has are rejected, not rounded", () => {
  assert.equal(parseSwapAmount("0.1234567", 6), null)
  assert.equal(parseSwapAmount("0.123456", 6).toString(), "0.123456")
})

test("base amount is exact", () => {
  assert.equal(toBaseAmount(parseSwapAmount("1.5", 6), 6), "1500000")
  assert.equal(
    toBaseAmount(parseSwapAmount("0.000000000000000001", 18), 18),
    "1"
  )
})

const quoteFor100 = {
  poolId: "1816",
  denomIn: "ibc/A",
  denomOut: "factory/x/alloyed/allUSDT",
  amountIn: "100000000",
}

test("a quote for 100 does not match a visible 1", () => {
  assert.equal(
    quoteMatches(quoteFor100, { ...quoteFor100, amountIn: "1000000" }),
    false
  )
})

test("a quote does not match other denoms or pools", () => {
  assert.equal(
    quoteMatches(quoteFor100, { ...quoteFor100, denomIn: "ibc/B" }),
    false
  )
  assert.equal(
    quoteMatches(quoteFor100, { ...quoteFor100, poolId: "1868" }),
    false
  )
})

test("no quote or invalid input never matches", () => {
  assert.equal(quoteMatches(undefined, quoteFor100), false)
  assert.equal(quoteMatches(quoteFor100, null), false)
  assert.equal(quoteMatches(quoteFor100, { ...quoteFor100 }), true)
})
