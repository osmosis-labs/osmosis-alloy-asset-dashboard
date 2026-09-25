import { Prisma, PrismaClient } from "@prisma/client"

import { fetchLcd } from "@/lib/utils"

import { blockTime, latestHeight } from "./activity-ingest"

// Pool reserve snapshots for the "Backing Over Time" chart: each alloy pool's
// accounted reserves per denom at a block height, from the transmuter's own
// get_total_pool_liquidity query (excludes stray tokens sent to the contract,
// which the raw bank balance would include). Historical heights need an
// archive node, and lcd.osmosis.zone blocks contract queries, so this always
// goes to the archive. No Next.js imports.

export const ARCHIVE_HOSTS = ["https://lcd.archive.osmosis.zone"]

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

// Cron step: one snapshot per pool per hour, at the run's tip. The cron runs
// every 15 minutes, so a slightly short interval keeps snapshots on the hour
// instead of drifting to every 75 minutes.
const SNAPSHOT_INTERVAL_MS = 55 * 60 * 1000

export const snapshotPoolIfDue = async ({
  db,
  poolId,
  contractAddress,
  height,
  ts,
}: {
  db: PrismaClient
  poolId: string
  contractAddress: string
  height: number
  ts: Date
}) => {
  const last = await db.poolReserveSnapshot.findFirst({
    where: { poolId },
    orderBy: { ts: "desc" },
    select: { ts: true },
  })
  if (last && ts.getTime() - last.ts.getTime() < SNAPSHOT_INTERVAL_MS) {
    return { poolId, snapshot: "not due" as const }
  }
  const liquidity = await poolLiquidityAt(contractAddress, height)
  const rows = liquidity
    ? await writeSnapshot(db, poolId, height, ts, liquidity)
    : 0
  return { poolId, snapshot: rows }
}

// Snapshots older than `days` are thinned to one per UTC day, so recent
// history stays hourly while the table grows by one snapshot per pool per
// day. Timestamps are stored as UTC. Days are bucketed 30 minutes early
// because a "00:00" snapshot is taken at the last block before midnight
// (heightAtTime lands at or before its target), which would otherwise count
// towards the previous day.
export const pruneReserveSnapshots = async (
  db: PrismaClient,
  days: number
): Promise<number> => {
  const cutoff = new Date(Date.now() - days * 86_400_000)
  return db.$executeRaw`
    DELETE FROM pool_reserve_snapshot s
    WHERE s.ts < ${cutoff}
      AND s.height NOT IN (
        SELECT DISTINCT ON (pool_id, date_trunc('day', ts + interval '30 minutes')) height
        FROM pool_reserve_snapshot
        WHERE pool_id = s.pool_id
        ORDER BY pool_id, date_trunc('day', ts + interval '30 minutes'), ts
      )`
}
