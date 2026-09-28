// Tests for the swap form's amount parsing, quote binding and the route a
// swap transaction is built with.
//
//   node scripts/test-swap.mts
import assert from "node:assert/strict"
import path from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"

const {
  parseSwapAmount,
  toBaseAmount,
  quoteMatches,
  directSwapFromQuote,
  alloyContract,
} = await import(pathToFileURL(path.resolve("src/lib/swap-amount.ts")).href)

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

// A direct quote as SQS returns it, for quoteFor100.
const sqsQuote = () => ({
  amount_in: { denom: "ibc/A", amount: "100000000" },
  amount_out: "100000000",
  route: [
    {
      pools: [{ id: 1816, token_out_denom: "factory/x/alloyed/allUSDT" }],
    },
  ],
})

test("the swap route is built from the selection, not the quote", () => {
  assert.deepEqual(directSwapFromQuote(sqsQuote(), quoteFor100), {
    routes: [{ poolId: "1816", tokenOutDenom: "factory/x/alloyed/allUSDT" }],
    minAmountOut: "100000000",
  })
})

test("a quote routed elsewhere or for another swap is refused", () => {
  const cases = {
    "another pool": (q) => (q.route[0].pools[0].id = 666),
    "another output token": (q) =>
      (q.route[0].pools[0].token_out_denom = "factory/evil/junk"),
    "an extra hop": (q) =>
      q.route[0].pools.push({ id: 1, token_out_denom: "uosmo" }),
    "a split route": (q) => q.route.push(q.route[0]),
    "no route": (q) => (q.route = []),
    "another input denom": (q) => (q.amount_in.denom = "ibc/B"),
    "another input amount": (q) => (q.amount_in.amount = "1"),
    "a zero output": (q) => (q.amount_out = "0"),
    "a non-integer output": (q) => (q.amount_out = "1.5"),
  }
  for (const [name, mutate] of Object.entries(cases)) {
    const q = sqsQuote()
    mutate(q)
    assert.throws(
      () => directSwapFromQuote(q, quoteFor100),
      /does not match/,
      name
    )
  }
})

test("an alloyed denom names its transmuter contract", () => {
  const contract =
    "osmo147h5x9pcj7lm0cttlaefx6sqq5vdfnmwfcqxkmjd7exqm9gc7grqhr75m0"
  assert.equal(alloyContract(`factory/${contract}/alloyed/allUSDC`), contract)
  assert.equal(alloyContract(`factory/${contract}/allUSDC`), null)
  assert.equal(
    alloyContract(
      "ibc/498A0751C798A0D9A389AA3691123DADA57DAA4FE165D5C75894505B876BA6E4"
    ),
    null
  )
  assert.equal(alloyContract(`factory/${contract}/alloyed/a/b`), null)
})
