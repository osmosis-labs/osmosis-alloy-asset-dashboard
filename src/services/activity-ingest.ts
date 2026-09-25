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
      lastError = new Error(`${host} returned ${res.status}`)
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
export const fetchSwapEvents = async ({
  poolId,
  from,
  to,
  maxPages,
  hosts = DEFAULT_LCD_HOSTS,
}: {
  poolId: string
  from: number // exclusive
  to: number // inclusive
  maxPages: number
  hosts?: string[]
}): Promise<{ events: SwapEvent[]; coveredTo: number }> => {
  const query = encodeURIComponent(
    `token_swapped.pool_id=${poolId} AND tx.height>${from} AND tx.height<=${to}`
  )
  const base = `/cosmos/tx/v1beta1/txs?query=${query}&order_by=1&limit=${PAGE_LIMIT}`

  const events: SwapEvent[] = []
  let exhausted = false
  for (let page = 1; page <= maxPages; page++) {
    const data = await lcdJson(hosts, `${base}&page=${page}`)
    const txs: any[] = data.tx_responses ?? []
    for (const tx of txs) events.push(...swapEventsFromTx(tx, poolId))
    if (txs.length < PAGE_LIMIT) {
      exhausted = true
      break
    }
  }
  return selectCompleteHeights(events, { from, to, exhausted })
}

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

  const rowsAdded = await db.$transaction(async (tx) => {
    const added = await writeEvents(tx, poolId, events)
    await tx.activityCursor.upsert({
      where: { poolId },
      create: {
        poolId,
        height: BigInt(coveredTo),
        coveredFrom: upToTime,
      },
      update: { height: BigInt(coveredTo) },
    })
    return added
  }, TX_OPTIONS)

  return { poolId, rowsAdded, cursor: coveredTo, lagBlocks: upTo - coveredTo }
}

// Drop swap rows older than `days`; their 15-minute rollups are kept.
export const pruneSwaps = async (db: PrismaClient, days: number) => {
  const cutoff = new Date(Date.now() - days * 86_400_000)
  const { count } = await db.poolSwap.deleteMany({
    where: { ts: { lt: cutoff } },
  })
  return count
}
