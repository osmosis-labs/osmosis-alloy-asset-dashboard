// Tests for the pool overview's pure helpers (assetlist decimals, market
// figures, image URLs, migration alloy assets) and the assetlist status text.
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

test("a redemption alloy is named after the stToken it redeems, not 1:1", () => {
  const sttia = MIGRATION_ALLOYS["3628"]
  const asset = migrationAlloyAsset(
    rawPool(
      coin(sttia.from, "stTIA", "Stride Staked TIA"),
      coin(sttia.to, "TIA", "Celestia")
    ),
    "factory/osmo1x/alloyed/stTIA",
    sttia,
    { [sttia.from]: { images } }
  )
  assert.equal(asset.symbol, "stTIA")
  assert.equal(asset.name, "Stride Staked TIA Redemption")
  assert.deepEqual(asset.images, images)
  assert.match(asset.description, /stTIA .*for TIA at the redemption rate/)
  assert.match(asset.description, /not 1:1/)
})

test("every configured migration pairs two different full denoms", () => {
  for (const [poolId, { from, to }] of Object.entries(MIGRATION_ALLOYS)) {
    assert.match(poolId, /^\d+$/)
    assert.match(from, /^ibc\/[0-9A-F]{64}$/, poolId)
    // stOSMO redeems for OSMO, the chain's native denom.
    assert.match(to, /^(ibc\/[0-9A-F]{64}|uosmo)$/, poolId)
    assert.notEqual(from, to, poolId)
  }
})

const { appStatusMessages } = await import(
  pathToFileURL(path.resolve("src/constants/status.ts")).href
)
const flags = (over: object) => ({
  unstable: false,
  unstableReason: null,
  disabled: false,
  haltDeposits: false,
  haltWithdrawals: false,
  depositHaltReason: null,
  withdrawalHaltReason: null,
  tooltipMessage: null,
  ...over,
})

test("status text matches the app: the maintainers' message when set", () => {
  assert.deepEqual(
    appStatusMessages(
      flags({
        unstable: true,
        unstableReason: "manual",
        tooltipMessage: "Paused.",
      })
    ),
    ["Paused."]
  )
})

test("without a message, one app sentence per flag (PEPE.axl, SHIB.axl, MARS.old, SUI.wh)", () => {
  assert.deepEqual(
    appStatusMessages(flags({ unstable: true, unstableReason: "market" })),
    [
      "This asset has had very low liquidity and trading volume for an extended period.",
    ]
  )
  assert.deepEqual(
    appStatusMessages(
      flags({ unstable: true, unstableReason: "market", haltDeposits: true })
    ),
    [
      "This asset has had very low liquidity and trading volume for an extended period.",
      "Deposits halted.",
    ]
  )
  assert.deepEqual(
    appStatusMessages(
      flags({
        unstable: true,
        unstableReason: "source_chain_killed",
        disabled: true,
        haltDeposits: true,
        depositHaltReason: "source_chain_killed",
        haltWithdrawals: true,
        withdrawalHaltReason: "source_chain_killed",
      })
    ),
    [
      "Source chain for this asset has ceased operation.",
      "Deposits halted. Source chain has ceased operation.",
      "Withdrawals halted. Source chain has ceased operation.",
      "Disabled: this asset is hidden on app.osmosis.zone.",
    ]
  )
  assert.deepEqual(appStatusMessages(flags({ disabled: true })), [
    "Disabled: this asset is hidden on app.osmosis.zone.",
  ])
})

test("an unmapped reason code gets the app's generic sentence", () => {
  assert.deepEqual(
    appStatusMessages(flags({ unstable: true, unstableReason: "new_code" })),
    ["Unstable, exercise caution."]
  )
})

const { poolBacking, backingNote, reserveValue, getPoolSources } = await import(
  pathToFileURL(path.resolve("src/lib/pool-sources.ts")).href
)

// A two-variant pool: 3 WBTC (8 decimals) and 1 nBTC (14 decimals).
const backingPool = (over: Record<string, unknown> = {}) => ({
  reserveCoins: [
    {
      currency: {
        amount: "300000000",
        currency: {
          coinMinimalDenom: "wbtc",
          coinDenom: "WBTC",
          coinDecimals: 8,
        },
      },
    },
    {
      currency: {
        amount: "100000000000000",
        currency: {
          coinMinimalDenom: "nbtc",
          coinDenom: "nBTC",
          coinDecimals: 14,
        },
      },
    },
  ],
  prices: { wbtc: 100, nbtc: 40 },
  alloy: { price: { amount: "90" } },
  status: { corruptedDenoms: [], reserves: {} },
  ...over,
})

test("backing values each variant at its own price", () => {
  const b = poolBacking(backingPool())
  assert.equal(b.usd, 3 * 100 + 1 * 40)
  assert.equal(backingNote(b), null)
})

test("a variant with no price of its own counts at the alloy price, noted", () => {
  const b = poolBacking(backingPool({ prices: { wbtc: 100 } }))
  assert.equal(b.usd, 300 + 90)
  assert.deepEqual(b.atAlloyPrice, ["nBTC"])
  assert.equal(backingNote(b), "nBTC at the alloy price")
})

test("fully halted and corrupted variants are not backing", () => {
  const halted = poolBacking(
    backingPool({
      status: {
        corruptedDenoms: [],
        reserves: { nbtc: { haltDeposits: true, haltWithdrawals: true } },
      },
    })
  )
  assert.equal(halted.usd, 300)
  assert.equal(backingNote(halted), "excludes nBTC (unbacked)")
  const corrupted = poolBacking(
    backingPool({ status: { corruptedDenoms: ["nbtc"], reserves: {} } })
  )
  assert.equal(corrupted.usd, 300)
  // Deposits halted alone still backs the alloy (it can be withdrawn).
  const depositsOnly = poolBacking(
    backingPool({
      status: {
        corruptedDenoms: [],
        reserves: { nbtc: { haltDeposits: true } },
      },
    })
  )
  assert.equal(depositsOnly.usd, 340)
})

test("no price at all is unknown, not zero", () => {
  const b = poolBacking(backingPool({ prices: {}, alloy: { price: null } }))
  assert.equal(b.usd, null)
})

// A redemption pool: 2 stTIA worth 1.5 TIA each, and 1 TIA (6 decimals).
const redemptionPool = (over: Record<string, unknown> = {}) => ({
  reserveCoins: [
    {
      currency: {
        amount: "2000000",
        currency: {
          coinMinimalDenom: "sttia",
          coinDenom: "stTIA",
          coinDecimals: 6,
        },
      },
      unitRate: 1.5,
    },
    {
      currency: {
        amount: "1000000",
        currency: {
          coinMinimalDenom: "tia",
          coinDenom: "TIA",
          coinDecimals: 6,
        },
      },
      unitRate: 1,
    },
  ],
  prices: { sttia: 15, tia: 10 },
  alloy: { price: { amount: "10" } },
  status: { corruptedDenoms: [], reserves: {} },
  ...over,
})

test("a redemption pool's stToken counts at its rate in alloy units", () => {
  const [sttia, tia] = redemptionPool().reserveCoins
  assert.equal(reserveValue(sttia), 3)
  assert.equal(reserveValue(tia), 1)
  // No rate: the variants share the alloy's unit.
  assert.equal(reserveValue(backingPool().reserveCoins[0]), 3)
  const groups = getPoolSources(redemptionPool(), "variant")
  assert.deepEqual(
    groups.map((g: { label: string; totalAmount: number }) => [
      g.label,
      g.totalAmount,
    ]),
    [
      ["stTIA", 3],
      ["TIA", 1],
    ]
  )
})

test("an unpriced stToken is backed at the alloy price times its rate", () => {
  const b = poolBacking(redemptionPool({ prices: { tia: 10 } }))
  assert.equal(b.usd, 2 * 10 * 1.5 + 1 * 10)
  assert.deepEqual(b.atAlloyPrice, ["stTIA"])
})
