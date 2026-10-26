import { SwapRow } from "@/types/tx"
import { sqsHeaders } from "@/lib/utils"

// The swap table's source when SQS_TRADES_URL is set: SQS's in-memory trade
// feed (GET /trades/list), the same deployment family the quotes and prices
// come from. Unset, the table keeps the activity store and live LCD path. The
// feed only holds what SQS ingested since it started (bounded retention, about
// 8 days by default), so it is a recent-swaps view, not full history. Set it
// to http://localhost:9092 to read a local SQS.
const tradesBaseUrl = (): string | null => {
  const raw =
    typeof process !== "undefined" && process.env
      ? process.env.SQS_TRADES_URL
      : undefined
  const url = raw?.trim().replace(/\/+$/, "")
  return url ? url : null
}

export const isTradesFeedEnabled = (): boolean => tradesBaseUrl() !== null

// Page sizes the table offers. SQS accepts 1 to 100.
export const TRADES_PAGE_SIZES = [20, 50, 100] as const

// The wire shape of one /trades/list trade. Amounts are base units of the
// chain minimal denoms; usdValueAtIngest is a decimal string.
type SqsTrade = {
  timestamp: number
  txHash: string
  wallet: string
  blockHeight: number
  txIndex: number
  eventIndex: number
  poolId: number
  coinMinimalDenomIn: string
  coinMinimalDenomOut: string
  inAmount: string
  outAmount: string
  usdValueAtIngest: string | null
  direction: "buy" | "sell" | null
  source: "swap" | "orderbookFill"
}

type SqsTradesList = { trades: SqsTrade[]; nextCursor: string | null }

export type TradesPage =
  | { status: "ok"; swaps: SwapRow[]; nextCursor: string | null }
  // SQS answers 503 until it has ingested its first block, and 404 when the
  // trades feature is turned off. Neither means the pool had no swaps.
  | { status: "unavailable"; reason: "not-ingested" | "disabled" }
  | { status: "error" }

const toSwapRow = (t: SqsTrade): SwapRow => ({
  hash: t.txHash,
  height: t.blockHeight,
  timestamp: new Date(t.timestamp * 1000).toISOString(),
  // SQS only ingests events from successful txs.
  success: true,
  // The swap message sender; for a swap routed through a contract this is
  // the contract, not the wallet behind it.
  sender: t.wallet,
  action: t.source,
  in: { amount: t.inAmount, denom: t.coinMinimalDenomIn },
  out: { amount: t.outAmount, denom: t.coinMinimalDenomOut },
  usdValueAtIngest: t.usdValueAtIngest,
})

// Cursors are opaque to the dashboard and only ever come back from SQS
// (unpadded base64url). Bound what is forwarded so the route cannot be used to
// send arbitrary query text.
export const isValidTradesCursor = (cursor: string) =>
  cursor.length > 0 && cursor.length <= 128 && /^[A-Za-z0-9_-]+$/.test(cursor)

// One page of a pool's trades, newest first. Never rejects.
export const getPoolTradesPage = async (
  poolId: string,
  limit: number,
  cursor: string | null
): Promise<TradesPage> => {
  const base = tradesBaseUrl()
  if (!base) return { status: "unavailable", reason: "disabled" }

  const url = new URL(`${base}/trades/list`)
  url.searchParams.set("poolId", poolId)
  url.searchParams.set("limit", String(limit))
  if (cursor) url.searchParams.set("cursor", cursor)

  try {
    // Not fetchWithRetry: 503 is the expected answer until ingest starts and
    // must reach the status mapping below, not be retried. The table refetches
    // on its own interval.
    const res = await fetch(url, {
      // The integrator token goes only to sqs.osmosis.zone, never to a local
      // or other SQS.
      headers: url.hostname === "sqs.osmosis.zone" ? sqsHeaders() : {},
      signal: AbortSignal.timeout(10000),
    })
    if (res.status === 503) {
      return { status: "unavailable", reason: "not-ingested" }
    }
    if (res.status === 404) return { status: "unavailable", reason: "disabled" }
    if (!res.ok) {
      console.error(`[trades] pool ${poolId}: SQS returned ${res.status}`)
      return { status: "error" }
    }
    const body = (await res.json()) as SqsTradesList
    if (!Array.isArray(body?.trades)) {
      console.error(`[trades] pool ${poolId}: malformed response`)
      return { status: "error" }
    }
    return {
      status: "ok",
      // Scoped by poolId, but keep only this pool's rows in case the scope
      // ever widens.
      swaps: body.trades
        .filter((t) => String(t.poolId) === poolId)
        .map(toSwapRow),
      nextCursor:
        typeof body.nextCursor === "string" && body.nextCursor.length > 0
          ? body.nextCursor
          : null,
    }
  } catch (e) {
    console.error(`[trades] pool ${poolId}: ${e}`)
    return { status: "error" }
  }
}
