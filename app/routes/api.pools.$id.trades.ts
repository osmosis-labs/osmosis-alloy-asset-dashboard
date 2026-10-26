import { extraDenomMeta } from "@/services/load-swaps"
import { getPoolOverview } from "@/services/pool"
import {
  getPoolTradesPage,
  isTradesFeedEnabled,
  isValidTradesCursor,
  TRADES_PAGE_SIZES,
} from "@/services/trades"

import type { Route } from "./+types/api.pools.$id.trades"

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })

// One page of the swap table from the SQS trade feed. Pagination is by
// cursor: SQS returns no total count, so the table offers next and previous
// pages only.
export async function loader({ request, params }: Route.LoaderArgs) {
  const search = new URL(request.url).searchParams
  const id = params.id
  const limit = Number(search.get("limit") ?? TRADES_PAGE_SIZES[0])
  const cursor = search.get("cursor")
  if (
    !/^\d+$/.test(id) ||
    !(TRADES_PAGE_SIZES as readonly number[]).includes(limit) ||
    (cursor !== null && !isValidTradesCursor(cursor))
  ) {
    return json({ status: "error", error: "bad request" }, 400)
  }
  if (!isTradesFeedEnabled()) {
    return json({ status: "unavailable", reason: "disabled" })
  }
  // Only pools the dashboard lists, matched exactly.
  const pool = await getPoolOverview(id)
  if (!pool) return json({ status: "error", error: "not found" }, 404)

  const page = await getPoolTradesPage(id, limit, cursor)
  if (page.status !== "ok") {
    // Unavailable is a state the table shows, not a failed request.
    return json(page, page.status === "error" ? 502 : 200)
  }
  // Symbols and decimals for variants missing from the current reserves
  // (drained to zero), from the assetlist.
  const extraDenoms = await extraDenomMeta(pool, page.swaps)
  return json({ ...page, extraDenoms })
}
