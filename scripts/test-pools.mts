// Tests for the pool overview's pure helpers: assetlist decimals, market
// figures, image URLs and migration alloy assets.
//
//   node scripts/test-pools.mts
import assert from "node:assert/strict"
import path from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"

const { displayExponent, marketFiat, appImageUrl, migrationAlloyAsset } =
  await import(pathToFileURL(path.resolve("src/lib/pool-build.ts")).href)
const { MIGRATION_ALLOYS } = await import(
  pathToFileURL(path.resolve("src/constants/migration.ts")).href
)

test("decimals come from the display unit, and a real 0 stays 0", () => {
  const units = (display: string, ...exps: [string, number][]) => ({
    display,
    denom_units: exps.map(([denom, exponent]) => ({ denom, exponent })),
  })
  assert.equal(displayExponent(units("atom", ["uatom", 0], ["atom", 6])), 6)
  assert.equal(displayExponent(units("boot", ["boot", 0])), 0)
  // Display unit not last: its own exponent, not the last unit's.
  assert.equal(
    displayExponent(units("mars", ["umars", 0], ["mars", 6], ["kmars", 9])),
    6
  )
  assert.equal(
    displayExponent({
      display: "btc",
      denom_units: [
        { denom: "sat", exponent: 0 },
        { denom: "BTC", exponent: 8, aliases: ["btc"] },
      ],
    }),
    8
  )
  assert.equal(displayExponent(units("missing", ["u", 0], ["x", 6])), null)
})

test("a missing market figure is unknown, not $0", () => {
  assert.equal(marketFiat(undefined), null)
  assert.equal(marketFiat(""), null)
  assert.equal(marketFiat('{"amount":"12.5"}').amount, "12.5")
})

test("app-relative images get the app's host; absolute ones are kept", () => {
  assert.equal(
    appImageUrl("/tokens/generated/stars.svg"),
    "https://app.osmosis.zone/tokens/generated/stars.svg"
  )
  assert.equal(appImageUrl("https://x.test/a.svg"), "https://x.test/a.svg")
  assert.equal(appImageUrl(undefined), "")
})

const contract =
  "osmo1gm4nfp929764y8jupgqa7uzx793u6f87r9psaglfngdv0j38lxfs5ln0r4"
const alloyDenom = `factory/${contract}/alloyed/allSTARS`
const stars = MIGRATION_ALLOYS["3471"]
const coin = (denom: string, symbol: string, name: string, decimals = 6) =>
  JSON.stringify({
    currency: {
      coinDenom: symbol,
      coinName: name,
      coinMinimalDenom: denom,
      coinDecimals: decimals,
    },
    amount: "1",
  })
const rawPool = (...reserveCoins: string[]) => ({
  id: "3471",
  raw: { contract_address: contract },
  reserveCoins,
})
const images = [{ svg: "https://x.test/stars.svg" }]

test("a migration alloy is named after its replacement token", () => {
  const asset = migrationAlloyAsset(
    rawPool(
      coin(stars.to, "STARS", "Stargaze"),
      coin(stars.from, "STARS.og", "Stargaze (Original)")
    ),
    alloyDenom,
    stars,
    { [stars.to]: { images } }
  )
  assert.equal(asset.symbol, "allSTARS")
  assert.equal(asset.name, "Stargaze Migration")
  assert.equal(asset.base, alloyDenom)
  assert.equal(asset.address, contract)
  assert.equal(asset.decimal, 6)
  assert.deepEqual(asset.images, images)
  assert.match(asset.description, /STARS\.og .*for STARS 1:1/)
})

test("a migration pool missing a variant, or with mixed decimals, is not built", () => {
  assert.equal(
    migrationAlloyAsset(
      rawPool(coin(stars.to, "STARS", "Stargaze")),
      alloyDenom,
      stars,
      {}
    ),
    undefined
  )
  assert.equal(
    migrationAlloyAsset(
      rawPool(
        coin(stars.to, "STARS", "Stargaze", 6),
        coin(stars.from, "STARS.og", "Stargaze (Original)", 18)
      ),
      alloyDenom,
      stars,
      {}
    ),
    undefined
  )
})

test("every configured migration pairs two different full denoms", () => {
  for (const [poolId, { from, to }] of Object.entries(MIGRATION_ALLOYS)) {
    assert.match(poolId, /^\d+$/)
    assert.match(from, /^ibc\/[0-9A-F]{64}$/, poolId)
    assert.match(to, /^ibc\/[0-9A-F]{64}$/, poolId)
    assert.notEqual(from, to, poolId)
  }
})
