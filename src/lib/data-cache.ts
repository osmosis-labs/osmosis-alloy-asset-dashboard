// Shared cache for the read path. On the Worker the binding is set by
// workers/app.ts and backed by the DATA_CACHE KV namespace. Scripts, the cron
// runner, and the browser have no binding, so the function runs uncached.
//
// Returned values are stored as JSON. A thrown error is not stored: a failed
// refresh leaves the previous value in place and serves it stale, and a miss
// that throws is retried on the next call. That is the contract the pool and
// asset-list caches rely on to avoid caching an empty dashboard.

type DataCacheKv = {
  get(key: string, type: "text"): Promise<string | null>
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ): Promise<void>
}

declare global {
  var __DATA_CACHE__: DataCacheKv | undefined
}

type CacheOptions = { revalidate?: number | false; tags?: string[] }

type Entry = { v: unknown; exp: number }

const inflight = new Map<string, Promise<unknown>>()

// KV keys are limited to 512 bytes. The digest is stable and short; keyParts
// are still hashed in, so a version bump in the caller changes the entry.
const cacheKey = async (keyParts: string[], args: unknown[]) => {
  const bytes = new TextEncoder().encode(JSON.stringify([keyParts, args]))
  const digest = await crypto.subtle.digest("SHA-256", bytes)
  const hex = [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return `v1:${hex}`
}

const readEntry = async (kv: DataCacheKv, key: string): Promise<Entry | null> => {
  try {
    const raw = await kv.get(key, "text")
    if (!raw) return null
    const parsed = JSON.parse(raw) as Entry
    if (!parsed || typeof parsed.exp !== "number" || !("v" in parsed)) return null
    return parsed
  } catch (e) {
    console.error(`[data-cache] read failed: ${e}`)
    return null
  }
}

const writeEntry = async (
  kv: DataCacheKv,
  key: string,
  value: unknown,
  revalidate: number
) => {
  const body = JSON.stringify({ v: value, exp: Date.now() + revalidate * 1000 })
  // Keep the key past the fresh window so a failed refresh can still serve it.
  const expirationTtl = revalidate + 7 * 24 * 60 * 60
  await kv.put(key, body, { expirationTtl })
}

export const dataCache = <Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>,
  keyParts: string[],
  options?: CacheOptions
): ((...args: Args) => Promise<R>) => {
  return async (...args) => {
    const ttl = options?.revalidate
    const kv = globalThis.__DATA_CACHE__
    if (!kv || typeof ttl !== "number" || ttl <= 0) return fn(...args)

    const key = await cacheKey(keyParts, args)
    const existing = inflight.get(key)
    if (existing) return existing as Promise<R>

    const run = (async () => {
      const hit = await readEntry(kv, key)
      if (hit && Date.now() < hit.exp) return hit.v as R
      try {
        const value = await fn(...args)
        try {
          await writeEntry(kv, key, value, ttl)
        } catch (e) {
          console.error(`[data-cache] write failed: ${e}`)
        }
        return value
      } catch (e) {
        if (hit) return hit.v as R
        throw e
      }
    })()

    inflight.set(key, run)
    try {
      return await run
    } finally {
      if (inflight.get(key) === run) inflight.delete(key)
    }
  }
}
