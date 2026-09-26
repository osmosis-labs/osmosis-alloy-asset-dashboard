import { Prisma, PrismaClient } from "@prisma/client"
import _ from "lodash"

import { fetchLcd } from "@/lib/utils"

import { SwapEvent, swapEventsFromTx } from "./swap-rows"

// Ingest of token_swapped events into the activity store (prisma/schema.prisma).
// Used by the activity cron (live, forward from each pool's cursor) and by the
// backfill script (a fixed historical height range). No Next.js imports.

export const BLOCKS_PER_DAY = 72000
const PAGE_LIMIT = 100
const BUCKET_SECONDS = 900 // 15 minutes, matches pool_flow_15m (and the 900 literal in writeEvents' SQL)

// Main LCD first; the archive serves the same tx search and is the fallback
// when lcd.osmosis.zone refuses the caller (fail2ban bans, connection resets).
export const DEFAULT_LCD_HOSTS = [
  "https://lcd.osmosis.zone",
  "https://lcd.archive.osmosis.zone",
]

const lcdJson = async (hosts: string[], path: string, timeoutMs = 30000) => {
  let lastError: unknown
  for (const host of hosts) {
    try {
      const res = await fetchLcd(`${host}${path}`, { timeoutMs })
      if (res.ok) return await res.json()
      // Keep the gRPC message: the archive reports an oversized response
      // ("received message larger than max") as a 429, which callers need to
      // tell apart from rate limiting.
      const detail = await res
        .json()
        .then((b) => (b?.message ? `: ${b.message}` : ""))
        .catch(() => "")
      lastError = new Error(`${host} returned ${res.status}${detail}`)
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`LCD failed: ${path}`)
}

export const latestHeight = async (hosts = DEFAULT_LCD_HOSTS) => {
  const data = await lcdJson(
    hosts,
    "/cosmos/base/tendermint/v1beta1/blocks/latest"
  )
  return Number(data.block.header.height)
}

export const blockTime = async (height: number, hosts = DEFAULT_LCD_HOSTS) => {
  const data = await lcdJson(
    hosts,
    `/cosmos/base/tendermint/v1beta1/blocks/${height}`
  )
  return new Date(data.block.header.time)
}

// Swap events for `poolId` in heights (from, to], ascending, reading at most
// `maxPages` pages. Returns the events of every *complete* height and the last
// height they cover: if the page cap cut the range short, the final height
// may be split across pages, so it is dropped and left for the next call.
// `pageLimit` lowers the page size for ranges whose txs are so large that a
// full page exceeds the LCD's 10MB gRPC message cap.
export const fetchSwapEvents = async ({
  poolId,
  from,
  to,
  maxPages,
  hosts = DEFAULT_LCD_HOSTS,
  pageLimit = PAGE_LIMIT,
}: {
  poolId: string
  from: number // exclusive
  to: number // inclusive
  maxPages: number
  hosts?: string[]
  pageLimit?: number
}): Promise<{ events: SwapEvent[]; coveredTo: number }> => {
  const query = encodeURIComponent(
    `token_swapped.pool_id=${poolId} AND tx.height>${from} AND tx.height<=${to}`
  )
  const base = `/cosmos/tx/v1beta1/txs?query=${query}&order_by=1&limit=${pageLimit}`

  const events: SwapEvent[] = []
  let exhausted = false
  for (let page = 1; page <= maxPages; page++) {
    const data = await lcdJson(hosts, `${base}&page=${page}`)
    const txs: any[] = data.tx_responses ?? []
    for (const tx of txs) events.push(...swapEventsFromTx(tx, poolId))
    // Stop on `total`, not just a short page: when the range holds an exact
    // multiple of the page size the last page is full, and asking for the next
    // one is an error (500 "page should be within [1, n] range").
    if (isLastPage(page, txs.length, Number(data.total), pageLimit)) {
      exhausted = true
      break
    }
  }
  return selectCompleteHeights(events, { from, to, exhausted })
}

// Pure: whether `page` (1-based) is the last page of the result set.
export const isLastPage = (
  page: number,
  pageSize: number,
  total: number,
  pageLimit = PAGE_LIMIT
) =>
  pageSize < pageLimit || (Number.isFinite(total) && page * pageLimit >= total)

// Pure: which events to keep and how far the range is covered. Exported for
// tests.
export const selectCompleteHeights = (
  events: SwapEvent[],
  { from, to, exhausted }: { from: number; to: number; exhausted: boolean }
): { events: SwapEvent[]; coveredTo: number } => {
  if (exhausted) return { events, coveredTo: to }
  if (events.length === 0) return { events, coveredTo: from }
  const maxHeight = _.maxBy(events, "height")!.height
  return {
    events: events.filter((e) => e.height < maxHeight),
    coveredTo: maxHeight - 1,
  }
}

// Pure: ends a backfill slice on a 15-minute bucket boundary. Events in the
// bucket that the slice's last block falls in are dropped (the bucket may
// continue past the slice), and coverage is pulled back to just before the
// first dropped event, so the next slice starts with that whole bucket. Every
// bucket is then written by exactly one slice, from rows that slice fetched:
// its rollup never depends on swap rows from an earlier slice, which may
// already be pruned. Exported for tests.
export const trimToBucketBoundary = (
  events: SwapEvent[],
  { coveredTo, coveredToTime }: { coveredTo: number; coveredToTime: Date }
): { events: SwapEvent[]; coveredTo: number } => {
  const bucketMs = BUCKET_SECONDS * 1000
  const boundary = Math.floor(coveredToTime.getTime() / bucketMs) * bucketMs
  const time = (e: SwapEvent) => new Date(e.timestamp).getTime()
  const dropped = events.filter((e) => time(e) >= boundary)
  if (dropped.length === 0) return { events, coveredTo }
  return {
    events: events.filter((e) => time(e) < boundary),
    coveredTo: _.minBy(dropped, "height")!.height - 1,
  }
}

// Pure: whether an activity cron run failed as a whole (so it returns 502 and
// status-based monitoring sees it): every pool's ingest failed, or every
// reserve snapshot that was due failed. Partial failures are not a failed run;
// their errors are in the response body. Exported for tests.
export const cronRunStatus = (
  results: { error?: unknown; snapshot?: unknown }[]
) => {
  const ingestFailed = results.filter((r) => "error" in r).length
  const snapshotsDue = results.filter((r) => r.snapshot !== "not due").length
  const snapshotFailed = results.filter(
    (r) =>
      typeof r.snapshot === "object" &&
      r.snapshot !== null &&
      "error" in r.snapshot
  ).length
  return {
    failed:
      (ingestFailed > 0 && ingestFailed === results.length) ||
      (snapshotFailed > 0 && snapshotFailed === snapshotsDue),
    ingestFailed,
    snapshotFailed,
  }
}

// Pure: the 15-minute bucket range [start, end) that fully contains `events`.
export const bucketRange = (events: SwapEvent[]) => {
  const times = events.map((e) => new Date(e.timestamp).getTime() / 1000)
  const start = Math.floor(_.min(times)! / BUCKET_SECONDS) * BUCKET_SECONDS
  const end = (Math.floor(_.max(times)! / BUCKET_SECONDS) + 1) * BUCKET_SECONDS
  return { start: new Date(start * 1000), end: new Date(end * 1000) }
}

// Insert events and recompute the 15-minute buckets they touch. Idempotent:
// rows are keyed on (pool, tx, msg index, event index) and buckets are
// recomputed from pool_swap, so re-running a range changes nothing.
export const writeEvents = async (
  tx: Prisma.TransactionClient,
  poolId: string,
  events: SwapEvent[]
) => {
  if (events.length === 0) return 0
  const { count } = await tx.poolSwap.createMany({
    data: events.map((e) => ({
      poolId,
      height: BigInt(e.height),
      txHash: e.hash,
      msgIndex: e.msgIndex,
      eventIndex: e.eventIndex,
      ts: new Date(e.timestamp),
      sender: e.sender,
      action: e.action,
      contract: e.contract ?? null,
      denomIn: e.in.denom,
      amountIn: new Prisma.Decimal(e.in.amount),
      denomOut: e.out.denom,
      amountOut: new Prisma.Decimal(e.out.amount),
    })),
    skipDuplicates: true,
  })

  const { start, end } = bucketRange(events)
  await tx.$executeRaw`
    INSERT INTO pool_flow_15m (pool_id, bucket, denom, amount_in, amount_out, swaps)
    SELECT pool_id, bucket, denom, SUM(amount_in), SUM(amount_out), COUNT(*)::int
    FROM (
      SELECT pool_id,
             to_timestamp(floor(extract(epoch FROM ts) / 900) * 900) AS bucket,
             denom_in AS denom, amount_in, 0::numeric AS amount_out
      FROM pool_swap
      WHERE pool_id = ${poolId} AND ts >= ${start} AND ts < ${end}
      UNION ALL
      SELECT pool_id,
             to_timestamp(floor(extract(epoch FROM ts) / 900) * 900) AS bucket,
             denom_out AS denom, 0::numeric AS amount_in, amount_out
      FROM pool_swap
      WHERE pool_id = ${poolId} AND ts >= ${start} AND ts < ${end}
    ) flows
    GROUP BY pool_id, bucket, denom
    ON CONFLICT (pool_id, bucket, denom) DO UPDATE
      SET amount_in = EXCLUDED.amount_in,
          amount_out = EXCLUDED.amount_out,
          swaps = EXCLUDED.swaps
  `
  return count
}

// Transactions here span a few inserts and one aggregate; Prisma's 5s default
// interactive-transaction timeout is too tight on Vercel.
export const TX_OPTIONS = { timeout: 60_000, maxWait: 10_000 }

// Live ingest for one pool: from its cursor up to `upTo`, at most `maxPages`
// pages per run. A pool with no cursor is seeded just behind the tip (the
// backfill fills history); its coverage starts at the tip's block time.
export const ingestPool = async ({
  db,
  poolId,
  upTo,
  upToTime,
  maxPages = 10,
  hosts = DEFAULT_LCD_HOSTS,
}: {
  db: PrismaClient
  poolId: string
  upTo: number
  upToTime: Date
  maxPages?: number
  hosts?: string[]
}) => {
  const cursor = await db.activityCursor.findUnique({ where: { poolId } })
  const from = cursor ? Number(cursor.height) : upTo - 750 // ~15 min seed
  if (from >= upTo) {
    return { poolId, rowsAdded: 0, cursor: from, lagBlocks: 0 }
  }

  const { events, coveredTo } = await fetchSwapEvents({
    poolId,
    from,
    to: upTo,
    maxPages,
    hosts,
  })

  const coveredThrough = coveredThroughTime({
    coveredTo,
    upTo,
    upToTime,
    events,
  })
  const rowsAdded = await db.$transaction(async (tx) => {
    const added = await writeEvents(tx, poolId, events)
    await tx.activityCursor.upsert({
      where: { poolId },
      create: {
        poolId,
        height: BigInt(coveredTo),
        coveredFrom: upToTime,
        coveredThrough,
      },
      update: {
        height: BigInt(coveredTo),
        ...(coveredThrough ? { coveredThrough } : {}),
      },
    })
    return added
  }, TX_OPTIONS)

  return { poolId, rowsAdded, cursor: coveredTo, lagBlocks: upTo - coveredTo }
}

// Pure: the block time a run leaves the store complete through. Reaching the
// tip means the tip's time. A page-capped run stops short of the tip, so it
// takes the newest event it kept (at or before the covered height, so a
// slight underestimate, which errs towards "not fresh"); with no events it
// made no progress and returns null (leave the stored value unchanged).
export const coveredThroughTime = ({
  coveredTo,
  upTo,
  upToTime,
  events,
}: {
  coveredTo: number
  upTo: number
  upToTime: Date
  events: SwapEvent[]
}): Date | null => {
  if (coveredTo >= upTo) return upToTime
  if (events.length === 0) return null
  return new Date(_.maxBy(events, (e) => e.height)!.timestamp)
}

// Drop swap rows older than `days`; their 15-minute rollups are kept.
export const pruneSwaps = async (db: PrismaClient, days: number) => {
  const cutoff = new Date(Date.now() - days * 86_400_000)
  const { count } = await db.poolSwap.deleteMany({
    where: { ts: { lt: cutoff } },
  })
  return count
}
