import { timingSafeEqual } from "node:crypto"
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
  heightAtTime,
  latestSnapshotTimes,
  poolLiquidityAt,
  pruneReserveSnapshots,
  RECENT_HOSTS,
  snapshotHoursDue,
  writeSnapshots,
} from "@/services/reserves"
import { ActivityCursor } from "@prisma/client"

import {
  hasCronStateFile,
  readCronState,
  writeCronState,
} from "@/lib/cron-state"
import { getPrisma, isDatabaseEnabled } from "@/lib/database"

// Activity store ingest, every 15 minutes, run by the GitHub Actions workflow
// (.github/workflows/cron.yml via scripts/run-cron.mts). Each run reads every
// listed pool's cursor and newest reserve snapshot time (one query each),
// fetches each pool's token_swapped events from its cursor up to the current
// tip from the LCD, then writes all pools together (swap rows, 15-minute
// rollups, cursors) in a few statements, and the reserve snapshots of every
// pool due one in one more. Once a day, just after midnight UTC, a run also
// folds 15-minute rollups older than 8 days into daily ones, prunes swap rows
// older than a week and thins old reserve snapshots. About 5 billed database
// operations a run, whatever the number of pools.
// The pool page reads the store once a pool's history is fresh and covers the
// window; until then it keeps using live LCD queries.
//
// Security: requests need `Authorization: Bearer <CRON_SECRET>`
// (scripts/run-cron.mts supplies a per-run secret). Others are rejected, and
// the route refuses to run if CRON_SECRET is unset. fetch() is not cached
// here (the Worker and the script runner both hit the LCD directly), so a
// latest-block response cannot pin every run to the same tip.

// Swap rows are kept this long (the Recent Swaps table); their rollups are
// kept for good, folded to daily after 8 days.
const SWAP_RETENTION_DAYS = 7
// Reserve snapshots stay hourly this long, then one per day is kept, then one
// per week.
const HOURLY_SNAPSHOT_DAYS = 7
const DAILY_SNAPSHOT_DAYS = 90
// The UTC day ("YYYY-MM-DD") whose daily maintenance has run (state file only).
const MAINTENANCE_DAY_KEY = "activity.maintenanceDay"

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
    return Response.json({ error: "not configured" }, { status: 500 })
  }
  if (!bearerMatches(request.headers.get("authorization"), cronSecret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 })
  }
  if (!isDatabaseEnabled()) {
    return Response.json({ skipped: "activity store not configured" })
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
    return Response.json({ error: "cursor read failed" }, { status: 502 })
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

  // Hourly reserve snapshots for the Backing Over Time chart, one per pool
  // per calendar hour, written in one insert. Each run fills every hour since
  // a pool's newest snapshot (snapshotHoursDue), so a late or dropped run, a
  // failed query or a pool briefly out of the list leaves no gap: the current
  // hour at the tip, earlier hours at the block two minutes past the hour,
  // resolved once per hour and shared by every pool. Recent-state LCDs first,
  // the archive last.
  const tip = { height: upTo, time: upToTime.getTime() }
  const currentHour = Math.floor(tip.time / 3_600_000) * 3_600_000
  const hourHeights = new Map<number, Promise<{ height: number; time: Date }>>()
  const blockForHour = (hour: number) => {
    if (hour === currentHour) {
      return Promise.resolve({ height: upTo, time: upToTime })
    }
    let block = hourHeights.get(hour)
    if (!block) {
      // Two minutes in: heightAtTime returns the block at or just before its
      // target, which at the hour itself would be stamped in the hour before.
      block = heightAtTime(new Date(hour + 120_000), {
        hosts: RECENT_HOSTS,
        tip,
      })
      hourHeights.set(hour, block)
    }
    return block
  }
  const due = lastSnapshots
    ? pools
        .map((p) => ({
          pool: p,
          hours: snapshotHoursDue(lastSnapshots.get(p.id) ?? null, upToTime),
        }))
        .filter((d) => d.hours.length > 0)
    : []
  const snapshots = []
  const snapshotErrors: Record<string, string> = {}
  let failedPools = 0
  for (const { pool, hours } of due) {
    let failed = false
    for (const hour of hours) {
      try {
        const block = await blockForHour(hour)
        const liquidity = await poolLiquidityAt(
          pool.contractAddress,
          block.height,
          RECENT_HOSTS
        )
        if (liquidity) {
          snapshots.push({
            poolId: pool.id,
            height: block.height,
            ts: block.time,
            liquidity,
          })
        }
      } catch (e) {
        // Later hours are still worth trying; the next run retries this one.
        console.error(
          `[cron/activity] pool ${pool.id} snapshot for ${new Date(hour).toISOString()} failed: ${e}`
        )
        snapshotErrors[pool.id] = String(e)
        failed = true
      }
    }
    if (failed) failedPools++
  }
  let snapshotRows = 0
  try {
    snapshotRows = await writeSnapshots(db, snapshots)
  } catch (e) {
    console.error(`[cron/activity] snapshot write failed: ${e}`)
    writeError = writeError ?? String(e)
  }

  // Once a day: fold 15-minute rollups older than 8 days into daily ones,
  // prune old swap rows, and thin old reserve snapshots. The Actions runner
  // can start late or skip a slot, so with its state file the first run of
  // each UTC day does it, and a failed attempt is retried by the next run.
  // Without a state file (a scheduler that starts on the quarter hour), it is
  // the 00:00-00:15 UTC run.
  const maintenance: Record<string, unknown> = {}
  const today = upToTime.toISOString().slice(0, 10)
  const maintenanceDue = hasCronStateFile()
    ? readCronState(MAINTENANCE_DAY_KEY, "") !== today
    : isDailyMaintenanceRun(upToTime)
  if (maintenanceDue) {
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
      writeCronState(MAINTENANCE_DAY_KEY, today)
    } catch (e) {
      console.error(`[cron/activity] daily maintenance failed: ${e}`)
      maintenance.error = String(e)
    }
  }

  const failed =
    !!writeError ||
    (pools.length > 0 && Object.keys(ingestErrors).length === pools.length) ||
    (due.length > 0 && snapshots.length === 0 && failedPools > 0)
  return Response.json(
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
