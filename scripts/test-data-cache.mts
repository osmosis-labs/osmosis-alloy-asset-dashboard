// Tests for the data cache's refresh-failure behaviour, against an in-memory
// KV.
//
//   node scripts/test-data-cache.mts
import assert from "node:assert/strict"
import path from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"

const { dataCache } = await import(
  pathToFileURL(path.resolve("src/lib/data-cache.ts")).href
)

const store = new Map<string, string>()
globalThis.__DATA_CACHE__ = {
  get: async (k: string) => store.get(k) ?? null,
  put: async (k: string, v: string) => void store.set(k, v),
}
// Expire every entry, so the next call refreshes.
const expireAll = () => {
  for (const [k, v] of store)
    store.set(k, JSON.stringify({ ...JSON.parse(v), exp: 0 }))
}

test("a failed refresh serves the expired value by default", async () => {
  let fail = false
  const cached = dataCache(
    async () => {
      if (fail) throw new Error("down")
      return "v1"
    },
    ["test-stale"],
    { revalidate: 60 }
  )
  assert.equal(await cached(), "v1")
  expireAll()
  fail = true
  assert.equal(await cached(), "v1")
})

test("staleOnError: false throws on a failed refresh", async () => {
  let fail = false
  const cached = dataCache(
    async () => {
      if (fail) throw new Error("down")
      return "v1"
    },
    ["test-fresh"],
    { revalidate: 60, staleOnError: false }
  )
  assert.equal(await cached(), "v1")
  expireAll()
  fail = true
  await assert.rejects(cached(), /down/)
  // A fresh entry is still served without calling the function.
  fail = false
  assert.equal(await cached(), "v1")
  fail = true
  assert.equal(await cached(), "v1")
})
