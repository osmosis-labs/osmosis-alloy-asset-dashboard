import { MinimalPool } from "@/types/pool"

import type { PoolsOverviewResult } from "./pool"

// Browser-side fetch of the dashboard's own /api/pools. Kept out of
// src/services/pool.ts, which pulls in server-only code (the Postgres
// activity store), so client components can import it. `source` and
// `builtAt` come from the response headers (see app/routes/api.pools.ts).
export const getPoolsFromAPI = async () => {
  const res = await fetch("/api/pools")
  if (!res.ok) throw new Error(`Pools unavailable (${res.status})`)
  const source = res.headers.get("X-Data-Source")
  return {
    pools: (await res.json()) as MinimalPool[],
    source:
      source === "live" || source === "runtime" || source === "snapshot"
        ? source
        : undefined,
    builtAt: res.headers.get("X-Data-Built-At") ?? undefined,
  } satisfies Pick<PoolsOverviewResult, "source" | "builtAt"> & {
    pools: MinimalPool[]
  }
}
