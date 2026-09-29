import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import {
  blockTime,
  byPoolId,
  dailyFlowCutoff,
  foldFlowsToDaily,
  isDailyMaintenanceRun,
  latestHeight,
  planPoolIngest,
  PoolIngestPlan,
  pruneSwaps,
  writeIngestBatch,
} from "@/services/activity-ingest"
import { getPoolsOverview } from "@/services/pool"
import {
  isSnapshotDue,
  latestSnapshotTimes,
  poolLiquidityAt,
  pruneReserveSnapshots,
  writeSnapshots,
} from "@/services/reserves"
import { ActivityCursor } from "@prisma/client"

import { getPrisma, isDatabaseEnabled } from "@/lib/database"

// Activity store ingest. Triggered by Vercel Cron (see vercel.json) every 15
// minutes. Each run reads every listed pool's cursor and newest reserve
// snapshot time (one query each), fetches each pool's token_swapped events
// from its cursor up to the current tip from the LCD, then writes all pools
// together (swap rows, 15-minute rollups, cursors) in a few statements, and
// the reserve snapshots of every pool due one in one more. The run just after
// midnight UTC also folds 15-minute rollups older than 8 days into daily ones,
// prunes swap rows older than a week and thins old reserve snapshots. About 5
// billed database operations a run, whatever the number of pools.
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

// Swap rows are kept this long (the Recent Swaps table); their rollups are
// kept for good, folded to daily after 8 days.
const SWAP_RETENTION_DAYS = 7
// Reserve snapshots stay hourly this long, then one per day is kept, then one
// per week.
const HOURLY_SNAPSHOT_DAYS = 7
const DAILY_SNAPSHOT_DAYS = 90

// Constant-time comparison, so response timing does not reveal how much of a
// guessed token matched.
const bearerMatches = (header: string | null, secret: string) => {
  const given = Buffer.from(header ?? "")
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error("[cron/activity] CRON_SECRET is not set; refusing to run")
    return NextResponse.json({ error: "not configured" }, { status: 500 })
  }
  if (!bearerMatches(request.headers.get("authorization"), cronSecret)) {
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
  const ids = pools.map((p) => p.id)

  // Cursors and newest snapshot times for every pool, one query each. Without
  // the cursors nothing can be planned, so a failed read fails the run; the
  // next one resumes from the same cursors.
  let cursors: Map<string, ActivityCursor | null>
  try {
    cursors = byPoolId(
      ids,
      await db.activityCursor.findMany({ where: { poolId: { in: ids } } })
    )
  } catch (e) {
    console.error(`[cron/activity] cursor read failed: ${e}`)
    return NextResponse.json({ error: "cursor read failed" }, { status: 502 })
  }
  let lastSnapshots: Map<string, Date | null> | null = null
  try {
    const latest = byPoolId(ids, await latestSnapshotTimes(db, ids))
    lastSnapshots = new Map(ids.map((id) => [id, latest.get(id)?.ts ?? null]))
  } catch (e) {
    console.error(`[cron/activity] snapshot time read failed: ${e}`)
  }

  // Swap events for every pool from the LCD (no database access), then one
  // batched write for all of them.
  const plans: PoolIngestPlan[] = []
  const ingestErrors: Record<string, string> = {}
  for (const pool of pools) {
    try {
      const plan = await planPoolIngest({
        poolId: pool.id,
        cursor: cursors.get(pool.id) ?? null,
        upTo,
        upToTime,
      })
      if (plan) plans.push(plan)
    } catch (e) {
      console.error(`[cron/activity] pool ${pool.id} ingest failed: ${e}`)
      ingestErrors[pool.id] = String(e)
    }
  }
  let rowsAdded = 0
  let writeError: string | null = null
  try {
    rowsAdded = await writeIngestBatch(db, plans)
  } catch (e) {
    console.error(`[cron/activity] batched write failed: ${e}`)
    writeError = String(e)
  }

  // Hourly reserve snapshots for the Backing Over Time chart (archive LCD),
  // written in one insert for every pool that is due.
  const due = lastSnapshots
    ? pools.filter((p) =>
        isSnapshotDue(lastSnapshots.get(p.id) ?? null, upToTime)
      )
    : []
  const snapshots = []
  const snapshotErrors: Record<string, string> = {}
  for (const pool of due) {
    try {
      const liquidity = await poolLiquidityAt(pool.contractAddress, upTo)
      if (liquidity) {
        snapshots.push({
          poolId: pool.id,
          height: upTo,
          ts: upToTime,
          liquidity,
        })
      }
    } catch (e) {
      console.error(`[cron/activity] pool ${pool.id} snapshot failed: ${e}`)
      snapshotErrors[pool.id] = String(e)
    }
  }
  let snapshotRows = 0
  try {
    snapshotRows = await writeSnapshots(db, snapshots)
  } catch (e) {
    console.error(`[cron/activity] snapshot write failed: ${e}`)
    writeError = writeError ?? String(e)
  }

  // Once a day: fold 15-minute rollups older than 8 days into daily ones,
  // prune old swap rows, and thin old reserve snapshots.
  const maintenance: Record<string, unknown> = {}
  if (isDailyMaintenanceRun(upToTime)) {
    try {
      maintenance.folded = await foldFlowsToDaily(
        db,
        dailyFlowCutoff(upToTime.getTime())
      )
      maintenance.pruned = await pruneSwaps(db, SWAP_RETENTION_DAYS)
      maintenance.thinned = await pruneReserveSnapshots(
        db,
        HOURLY_SNAPSHOT_DAYS,
        DAILY_SNAPSHOT_DAYS
      )
    } catch (e) {
      console.error(`[cron/activity] daily maintenance failed: ${e}`)
      maintenance.error = String(e)
    }
  }

  const failed =
    !!writeError ||
    (pools.length > 0 && Object.keys(ingestErrors).length === pools.length) ||
    (due.length > 0 && Object.keys(snapshotErrors).length === due.length)
  return NextResponse.json(
    {
      upTo,
      pools: pools.length,
      advanced: plans.length,
      rowsAdded,
      snapshots: snapshotRows,
      ingestErrors,
      snapshotErrors,
      writeError,
      maintenance,
    },
    { status: failed ? 502 : 200 }
  )
}
