import { Prisma, PrismaClient } from "@prisma/client"

import { fetchLcd } from "@/lib/utils"

import { blockTime, latestHeight } from "./activity-ingest"

// Pool reserve snapshots for the "Backing Over Time" chart: each alloy pool's
// accounted reserves per denom at a block height, from the transmuter's own
// get_total_pool_liquidity query (excludes stray tokens sent to the contract,
// which the raw bank balance would include). Historical heights need an
// archive node, and lcd.osmosis.zone blocks contract queries, so backfills go
// to the archive. No Next.js imports.

export const ARCHIVE_HOSTS = ["https://lcd.archive.osmosis.zone"]

// For heights near the tip (the cron's snapshots), any node holding recent
// state can answer. These serve contract queries at a requested height and
// echo the height they served; the archive, which often times out or returns
// 502, is the last resort.
export const RECENT_HOSTS = [
  "https://osmosis-api.polkachu.com",
  "https://rest.lavenderfive.com:443/osmosis",
  ...ARCHIVE_HOSTS,
]

const archiveJson = async (
  path: string,
  { height, hosts = ARCHIVE_HOSTS }: { height?: number; hosts?: string[] } = {}
) => {
  let lastError: unknown
  for (const host of hosts) {
    try {
      const res = await fetchLcd(`${host}${path}`, {
        timeoutMs: 30000,
        headers: height ? { "x-cosmos-block-height": String(height) } : {},
        returnServerErrors: true,
      })
      const body = await res.json().catch(() => null)
      // A node that pruned the height can answer from another one; never
      // accept a snapshot from a height other than the one asked for.
      const served = res.headers.get("grpc-metadata-x-cosmos-block-height")
      if (res.ok && height && served && served !== String(height)) {
        lastError = new Error(`${host} served height ${served}, not ${height}`)
        continue
      }
      if (res.ok) return body
      lastError = new Error(
        `${host} returned ${res.status}: ${String(body?.message ?? "").slice(0, 160)}`
      )
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`LCD failed: ${path}`)
}

export const poolContractAddress = async (
  poolId: string,
  hosts = ARCHIVE_HOSTS
): Promise<string> => {
  const data = await archiveJson(
    `/osmosis/poolmanager/v1beta1/pools/${poolId}`,
    {
      hosts,
    }
  )
  const address = data?.pool?.contract_address
  if (!address) throw new Error(`pool ${poolId} has no contract address`)
  return address
}

// The pool's reserves at `height`, or null if the contract did not exist yet.
export const poolLiquidityAt = async (
  contractAddress: string,
  height: number,
  hosts = ARCHIVE_HOSTS
): Promise<{ denom: string; amount: string }[] | null> => {
  const query = Buffer.from(
    JSON.stringify({ get_total_pool_liquidity: {} })
  ).toString("base64")
  try {
    const data = await archiveJson(
      `/cosmwasm/wasm/v1/contract/${contractAddress}/smart/${query}`,
      { height, hosts }
    )
    return data?.data?.total_pool_liquidity ?? []
  } catch (e) {
    // Before instantiation the contract is simply unknown at that height.
    if (/not found|no such contract/i.test(String(e))) return null
    throw e
  }
}

// Pure: next height estimate towards `target` given a measured block and the
// block rate.
export const correctHeight = (
  height: number,
  heightTime: number,
  target: number,
  msPerBlock: number
) => Math.round(height + (target - heightTime) / msPerBlock)

export type ChainTip = { height: number; time: number }

export const chainTip = async (hosts = ARCHIVE_HOSTS): Promise<ChainTip> => {
  const height = await latestHeight(hosts)
  return { height, time: (await blockTime(height, hosts)).getTime() }
}

// Block height at `target` (the block at or just before it, or one within a
// minute of it). Block times have varied a lot over Osmosis' history, so a
// constant-rate estimate can be months off years back. This brackets the
// target between a block before and a block after it, then narrows the
// bracket by interpolation, alternating with midpoint steps so it cannot
// stall. The returned time is always measured at the returned height.
// Pass `tip` when resolving many dates to avoid re-fetching it each time.
export const heightAtTime = async (
  target: Date,
  { hosts = ARCHIVE_HOSTS, tip }: { hosts?: string[]; tip?: ChainTip } = {}
): Promise<{ height: number; time: Date }> => {
  const goal = target.getTime()
  const top = tip ?? (await chainTip(hosts))
  if (goal >= top.time) return { height: top.height, time: new Date(top.time) }
  const timeAt = async (height: number) =>
    (await blockTime(height, hosts)).getTime()

  // Bracket: `hi` after the target (starting at the tip), `lo` at or before
  // it, found by stepping back with a doubling stride.
  let hi = { height: top.height, time: top.time }
  let lo: { height: number; time: number } | null = null
  let stride = Math.max(
    top.height - correctHeight(top.height, top.time, goal, 1200),
    1
  )
  for (let i = 0; i < 20 && !lo; i++) {
    const height = Math.max(hi.height - stride, 1)
    const time = await timeAt(height)
    if (time <= goal || height === 1) lo = { height, time }
    else {
      hi = { height, time }
      stride *= 2
    }
  }
  if (!lo) throw new Error(`no block found before ${target.toISOString()}`)

  for (let i = 0; i < 40 && hi.height - lo.height > 1; i++) {
    const guess =
      i % 2 === 0
        ? lo.height +
          ((goal - lo.time) / (hi.time - lo.time)) * (hi.height - lo.height)
        : (lo.height + hi.height) / 2
    const height = Math.min(
      Math.max(Math.round(guess), lo.height + 1),
      hi.height - 1
    )
    const time = await timeAt(height)
    if (Math.abs(time - goal) < 60_000) return { height, time: new Date(time) }
    if (time <= goal) lo = { height, time }
    else hi = { height, time }
  }
  return { height: lo.height, time: new Date(lo.time) }
}

export const writeSnapshot = async (
  db: PrismaClient,
  poolId: string,
  height: number,
  ts: Date,
  liquidity: { denom: string; amount: string }[]
) => {
  if (liquidity.length === 0) return 0
  const { count } = await db.poolReserveSnapshot.createMany({
    data: liquidity.map((l) => ({
      poolId,
      height: BigInt(height),
      ts,
      denom: l.denom,
      amount: new Prisma.Decimal(l.amount),
    })),
    skipDuplicates: true,
  })
  return count
}

// Several pools' snapshots in one insert (the cron writes all due pools at
// once).
export const writeSnapshots = async (
  db: PrismaClient,
  snapshots: {
    poolId: string
    height: number
    ts: Date
    liquidity: { denom: string; amount: string }[]
  }[]
) => {
  const data = snapshots.flatMap((s) =>
    s.liquidity.map((l) => ({
      poolId: s.poolId,
      height: BigInt(s.height),
      ts: s.ts,
      denom: l.denom,
      amount: new Prisma.Decimal(l.amount),
    }))
  )
  if (data.length === 0) return 0
  const { count } = await db.poolReserveSnapshot.createMany({
    data,
    skipDuplicates: true,
  })
  return count
}

// Cron step: one snapshot per pool per calendar hour (UTC). Scheduled runs
// start late or not at all, so each run fills every hour since the pool's
// newest snapshot, not just the current one: the current hour at the run's
// tip, earlier hours at the block just after the top of the hour. Capped, so a pool
// back after a long absence (or a long outage) doesn't stall a run; older
// gaps are for scripts/backfill-reserves.mts.
export const MAX_CATCH_UP_HOURS = 48
const HOUR_MS = 60 * 60 * 1000

// Pure: the hour starts (ms, ascending) a pool still needs a snapshot for,
// given its newest snapshot time (null when it has none) and the run's tip
// time. The last entry, when present, is the tip's own hour. A pool with no
// snapshot gets only the current hour. Exported for tests.
export const snapshotHoursDue = (
  lastTs: Date | null,
  tip: Date,
  maxHours = MAX_CATCH_UP_HOURS
): number[] => {
  const current = Math.floor(tip.getTime() / HOUR_MS) * HOUR_MS
  if (!lastTs) return [current]
  const lastHour = Math.floor(lastTs.getTime() / HOUR_MS) * HOUR_MS
  const first = Math.max(lastHour + HOUR_MS, current - (maxHours - 1) * HOUR_MS)
  const hours: number[] = []
  for (let h = first; h <= current; h += HOUR_MS) hours.push(h)
  return hours
}

// Newest snapshot time of each of `poolIds`, in one query (the cron reads
// these once per run rather than once per pool). Pools with no snapshot are
// absent.
export const latestSnapshotTimes = async (
  db: PrismaClient,
  poolIds: string[]
): Promise<{ poolId: string; ts: Date }[]> => {
  const rows = await db.poolReserveSnapshot.groupBy({
    by: ["poolId"],
    where: { poolId: { in: poolIds } },
    _max: { ts: true },
  })
  return rows.flatMap((r) =>
    r._max.ts ? [{ poolId: r.poolId, ts: r._max.ts }] : []
  )
}

// Snapshots older than `days` are thinned to one per UTC day, and those older
// than `weeklyDays` to one per week (ISO weeks, starting Monday), so recent
// history stays hourly while old history costs one snapshot per pool per
// week. The Backing Over Time chart's long ranges show weeks. Timestamps are
// stored as UTC. Days are bucketed 30 minutes early because a "00:00"
// snapshot is taken at the last block before midnight (heightAtTime lands at
// or before its target), which would otherwise count towards the previous
// day.
export const pruneReserveSnapshots = async (
  db: PrismaClient,
  days: number,
  weeklyDays = Infinity
): Promise<number> => {
  const cutoff = new Date(Date.now() - days * 86_400_000)
  const daily = await db.$executeRaw`
    DELETE FROM pool_reserve_snapshot s
    WHERE s.ts < ${cutoff}
      AND s.height NOT IN (
        SELECT DISTINCT ON (pool_id, date_trunc('day', ts + interval '30 minutes')) height
        FROM pool_reserve_snapshot
        WHERE pool_id = s.pool_id
        ORDER BY pool_id, date_trunc('day', ts + interval '30 minutes'), ts
      )`
  if (!Number.isFinite(weeklyDays)) return daily
  const weeklyCutoff = new Date(Date.now() - weeklyDays * 86_400_000)
  const weekly = await db.$executeRaw`
    DELETE FROM pool_reserve_snapshot s
    WHERE s.ts < ${weeklyCutoff}
      AND s.height NOT IN (
        SELECT DISTINCT ON (pool_id, date_trunc('week', ts + interval '30 minutes')) height
        FROM pool_reserve_snapshot
        WHERE pool_id = s.pool_id
        ORDER BY pool_id, date_trunc('week', ts + interval '30 minutes'), ts
      )`
  return daily + weekly
}
