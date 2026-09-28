import { NextResponse } from "next/server"
import {
  blockTime,
  byPoolId,
  cronRunStatus,
  ingestPool,
  latestHeight,
  pruneSwaps,
} from "@/services/activity-ingest"
import { getPoolsOverview } from "@/services/pool"
import {
  latestSnapshotTimes,
  pruneReserveSnapshots,
  snapshotPoolIfDue,
} from "@/services/reserves"
import { ActivityCursor } from "@prisma/client"

import { getPrisma, isDatabaseEnabled } from "@/lib/database"

// Activity store ingest. Triggered by Vercel Cron (see vercel.json) every 15
// minutes: reads every supported pool's cursor and newest reserve snapshot
// time up front (one query each), then for each pool reads token_swapped
// events from its cursor up to the current tip and writes them to Postgres
// (rows, 15-minute rollups, then the cursor, in one transaction per pool; a
// pool with no new events only moves its cursor), takes the pool's hourly
// reserve snapshot when due, then prunes old swap rows and thins reserve
// snapshots older than a week to daily.
// The pool page reads the store once a pool's history is fresh and covers the
// window; until then it keeps using live LCD queries.
//
// Security: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`. Requests
// without the matching bearer token are rejected, and the route refuses to run
// if CRON_SECRET is unset.
export const dynamic = "force-dynamic"
// Every LCD read must be live: Next 14 keeps fetch() responses in the Data
// Cache by default, and a cached latest-block response pins every run to the
// same tip, so the cursors stop advancing.
export const fetchCache = "force-no-store"
export const maxDuration = 300

// Swap rows are kept this long; their 15-minute rollups are kept for good.
const SWAP_RETENTION_DAYS = 31
// Reserve snapshots stay hourly this long, then one per day is kept.
const HOURLY_SNAPSHOT_DAYS = 7

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

  // Cursors and newest snapshot times for every pool in one query each,
  // instead of one of each per pool (the free tier bills per operation). If a
  // batched read fails, its map stays empty and each pool reads its own.
  const ids = pools.map((p) => p.id)
  let cursors = new Map<string, ActivityCursor | null>()
  try {
    cursors = byPoolId(
      ids,
      await db.activityCursor.findMany({ where: { poolId: { in: ids } } })
    )
  } catch (e) {
    console.error(`[cron/activity] cursor read failed: ${e}`)
  }
  let lastSnapshots = new Map<string, Date | null>()
  try {
    const latest = byPoolId(ids, await latestSnapshotTimes(db, ids))
    lastSnapshots = new Map(ids.map((id) => [id, latest.get(id)?.ts ?? null]))
  } catch (e) {
    console.error(`[cron/activity] snapshot time read failed: ${e}`)
  }

  const results = []
  for (const pool of pools) {
    let ingest: object
    try {
      ingest = await ingestPool({
        db,
        poolId: pool.id,
        upTo,
        upToTime,
        cursor: cursors.get(pool.id),
      })
    } catch (e) {
      console.error(`[cron/activity] pool ${pool.id} ingest failed: ${e}`)
      ingest = { error: String(e) }
    }
    // Hourly reserve snapshot for the Backing Over Time chart (archive LCD).
    let snapshot: unknown
    try {
      snapshot = (
        await snapshotPoolIfDue({
          db,
          poolId: pool.id,
          contractAddress: pool.contractAddress,
          height: upTo,
          ts: upToTime,
          lastTs: lastSnapshots.get(pool.id),
        })
      ).snapshot
    } catch (e) {
      console.error(`[cron/activity] pool ${pool.id} snapshot failed: ${e}`)
      snapshot = { error: String(e) }
    }
    results.push({ poolId: pool.id, ...ingest, snapshot })
  }

  let pruned = 0
  try {
    pruned = await pruneSwaps(db, SWAP_RETENTION_DAYS)
  } catch (e) {
    console.error(`[cron/activity] prune failed: ${e}`)
  }
  let thinned = 0
  try {
    thinned = await pruneReserveSnapshots(db, HOURLY_SNAPSHOT_DAYS)
  } catch (e) {
    console.error(`[cron/activity] snapshot thinning failed: ${e}`)
  }

  const { failed, ingestFailed, snapshotFailed } = cronRunStatus(results)
  return NextResponse.json(
    { upTo, results, pruned, thinned, ingestFailed, snapshotFailed },
    { status: failed ? 502 : 200 }
  )
}
