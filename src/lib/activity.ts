// Constants shared by the activity server code and client components. Kept
// out of src/services/pool.ts, which pulls in server-only code (Postgres).

// The live fallback only fetches this many of the most recent swaps: each
// 100-swap LCD page is ~3MB and 10-20s, so a busy pool's live chart covers
// just its latest few hours. The store has no such cap.
export const ACTIVITY_MAX_SWAPS = 1000

// Activity date ranges (the shared page range) in days; null = everything the
// store holds.
export const ACTIVITY_RANGE_DAYS: Record<string, number | null> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "1y": 365,
  all: null,
}

export type PoolActivitySource = "store" | "live"
