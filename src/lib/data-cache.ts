import { unstable_cache } from "next/cache"

// Next's data cache, usable outside Next. unstable_cache needs a running Next
// server's incremental cache and throws without one, which is the case for the
// GitHub Actions cron runner (scripts/run-cron.mts) and other scripts. Inside
// Next (NEXT_RUNTIME is "nodejs" or "edge" there) this is exactly
// unstable_cache; outside, there is no shared cache to use, so the function
// runs uncached. Decided per call, so module load order doesn't matter.
export const dataCache: typeof unstable_cache = (fn, keyParts, options) => {
  const cached = unstable_cache(fn, keyParts, options)
  return ((...args: Parameters<typeof fn>) =>
    process.env.NEXT_RUNTIME ? cached(...args) : fn(...args)) as typeof cached
}
