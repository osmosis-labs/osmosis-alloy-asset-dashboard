import { MinimalPool } from "@/types/pool"

// Browser-side fetch of the dashboard's own /api/pools. Kept out of
// src/services/pool.ts, which pulls in server-only code (the Postgres
// activity store), so client components can import it.
export const getPoolsFromAPI = async () => {
  return await fetch("/api/pools").then((res) =>
    res.json().then((d) => d as MinimalPool[])
  )
}
