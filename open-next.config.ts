import { defineCloudflareConfig } from "@opennextjs/cloudflare"
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache"
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache"
import memoryQueue from "@opennextjs/cloudflare/overrides/queue/memory-queue"

// ISR pages and unstable_cache entries live in Workers KV (shared by every
// request, like Vercel's data cache), read through the regional Cache API
// first so repeat reads don't each cost a KV read. No tag cache: the app
// never calls revalidateTag or revalidatePath. Stale pages are re-rendered
// in the background by the in-memory queue.
export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(kvIncrementalCache, {
    mode: "long-lived",
  }),
  queue: memoryQueue,
})
