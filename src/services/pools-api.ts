import { MinimalPool } from "@/types/pool"

// Browser-side fetch of the dashboard's own /api/pools. Kept out of
// src/services/pool.ts, which pulls in server-only code (the Postgres
// activity store), so client components can import it.
export const getPoolsFromAPI = async () => {
  const res = await fetch("/api/pools")
  if (!res.ok) throw new Error(`Pools unavailable (${res.status})`)
  return (await res.json()) as MinimalPool[]
}
