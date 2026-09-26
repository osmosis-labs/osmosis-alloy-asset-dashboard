// Tests for the swap page's pool assembly and wallet balance pagination.
//
//   node scripts/test-swap-page.mts
import assert from "node:assert/strict"
import path from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"

const imp = (p: string) => import(pathToFileURL(path.resolve(p)).href)
const { buildSwapPools } = await imp("src/lib/swap-pools.ts")
const { collectKeyPages } = await imp("src/lib/paginate.ts")

const asset = (denom: string, symbol = denom) =>
  ({ denom, symbol, name: symbol, decimal: 6 }) as any
const pool = (id: string, variants: string[], alloy: string) =>
  ({
    id,
    assets: variants,
    alloy: { asset: alloy, price: "1" },
    status: { isActive: true, corruptedDenoms: [] },
  }) as any

test("an assetlist outage is an error, not a pool list of undefined assets", () => {
  assert.throws(
    () => buildSwapPools([pool("1", ["a"], "all")], {}),
    /Asset list unavailable/
  )
})

test("a variant without metadata is dropped; the pool stays", () => {
  const [p] = buildSwapPools([pool("1", ["a", "missing"], "all")], {
    a: asset("a"),
    all: asset("all"),
  })
  assert.deepEqual(
    p.assets.map((a: any) => a.denom),
    ["a"]
  )
  assert.equal(p.alloy.asset.denom, "all")
})

test("a pool without alloy metadata or variants is omitted", () => {
  const pools = buildSwapPools(
    [
      pool("1", ["a"], "missing-alloy"),
      pool("2", ["missing"], "all"),
      pool("3", ["a"], "all"),
    ],
    { a: asset("a"), all: asset("all") }
  )
  assert.deepEqual(
    pools.map((p: any) => p.id),
    ["3"]
  )
})

test("no usable pools is an error", () => {
  assert.throws(
    () => buildSwapPools([pool("1", ["x"], "y")], { a: asset("a") }),
    /No pools available/
  )
})

test("balances follow next_key past the first page", async () => {
  const pages: Record<string, { items: string[]; nextKey: string | null }> = {
    first: {
      items: Array.from({ length: 100 }, (_, i) => `d${i}`),
      nextKey: "k2",
    },
    k2: { items: ["selected"], nextKey: null },
  }
  const keys: (string | undefined)[] = []
  const items = await collectKeyPages(async (key: string | undefined) => {
    keys.push(key)
    return pages[key ?? "first"]
  })
  assert.equal(items.length, 101)
  assert.ok(items.includes("selected"))
  assert.deepEqual(keys, [undefined, "k2"])
})

test("pagination stops with an error instead of looping forever", async () => {
  await assert.rejects(
    collectKeyPages(async () => ({ items: [1], nextKey: "again" }), 3),
    /more than 3 pages/
  )
})
