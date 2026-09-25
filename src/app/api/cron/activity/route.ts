import { NextResponse } from "next/server"
import {
  blockTime,
  ingestPool,
  latestHeight,
  pruneSwaps,
} from "@/services/activity-ingest"
import { getPoolsOverview } from "@/services/pool"

import { getPrisma, isDatabaseEnabled } from "@/lib/database"

// Activity store ingest. Triggered by Vercel Cron (see vercel.json) every 15
// minutes: for each supported pool, reads token_swapped events from its cursor
// up to the current tip and writes them to Postgres (rows, 15-minute rollups,
// then the cursor, in one transaction per pool), then prunes old swap rows.
// The pool page reads the store once a pool's history is fresh and covers the
// window; until then it keeps using live LCD queries.
//
// Security: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Requests
// without the matching bearer token are rejected, and the route refuses to run
// if CRON_SECRET is unset.
export const dynamic = "force-dynamic"
export const maxDuration = 300

// Swap rows are kept this long; their 15-minute rollups are kept for good.
const SWAP_RETENTION_DAYS = 31

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error("[cron/activity] CRON_SECRET is not set; refusing to run")
    return NextResponse.json({ error: "not configured" }, { status: 500 })
  }
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!isDatabaseEnabled()) {
    return NextResponse.json({ skipped: "activity store not configured" })
  }

  const db = getPrisma()
  // One tip for the whole run, so every pool is ingested to the same height.
  const upTo = await latestHeight()
  const upToTime = await blockTime(upTo)
  const { pools } = await getPoolsOverview()

  const results = []
  for (const pool of pools) {
    try {
      results.push(await ingestPool({ db, poolId: pool.id, upTo, upToTime }))
    } catch (e) {
      console.error(`[cron/activity] pool ${pool.id} failed: ${e}`)
      results.push({ poolId: pool.id, error: String(e) })
    }
  }

  let pruned = 0
  try {
    pruned = await pruneSwaps(db, SWAP_RETENTION_DAYS)
  } catch (e) {
    console.error(`[cron/activity] prune failed: ${e}`)
  }

  const failed = results.filter((r) => "error" in r).length
  return NextResponse.json(
    { upTo, results, pruned },
    { status: failed === results.length && failed > 0 ? 502 : 200 }
  )
}
