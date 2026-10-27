import { Suspense, useState } from "react"
import { Await } from "react-router"
import type { SwapsResult } from "@/services/load-swaps"
import { ChevronLeft, ChevronsLeft, Loader2, RotateCw } from "lucide-react"
import useSWR from "swr"

import { PoolOverview } from "@/types/pool"
import { SwapRow } from "@/types/tx"
import { ACTIVITY_MAX_SWAPS } from "@/lib/activity"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

import {
  TransactionTableContent,
  type CursorPaging,
  type ExtraDenomMeta,
} from "./transaction-table-content"

// Same box as the table so the card does not jump while loading or on error.
const Message = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-[300px] w-full items-center justify-center text-center">
    {children}
  </div>
)

const Loading = () => (
  <Message>
    <div role="status">
      <Loader2 className="size-8 animate-spin" />
      <span className="sr-only">Loading swaps</span>
    </div>
  </Message>
)

type UnavailableReason = "not-ingested" | "disabled"

// The /api/pools/:id/trades body.
type TradesResponse =
  | {
      status: "ok"
      swaps: SwapRow[]
      nextCursor: string | null
      extraDenoms: Record<string, ExtraDenomMeta>
    }
  | { status: "unavailable"; reason: UnavailableReason }
  | { status: "error" }

type TradesPage = Extract<TradesResponse, { status: "ok" }>

// Unavailable and failed answers throw, so a refresh that hits a restarting
// or failing SQS keeps the page already shown (SWR keeps the last data and
// sets the error) instead of replacing it with a notice.
class TradesError extends Error {
  constructor(readonly reason: UnavailableReason | null) {
    super(reason ?? "trades error")
  }
}

const fetchTrades = async (url: string): Promise<TradesPage> => {
  const res = await fetch(url)
  const body = (await res.json().catch(() => null)) as TradesResponse | null
  if (body?.status === "ok") return body
  throw new TradesError(body?.status === "unavailable" ? body.reason : null)
}

const UNAVAILABLE_TEXT: Record<UnavailableReason, string> = {
  "not-ingested":
    "Swap history is not available yet. It appears here once the swap feed has started.",
  disabled: "Swap history is unavailable: the swap feed is turned off.",
}

// Swaps from the SQS trade feed, newest first. The feed has no total count,
// so paging is by cursor: `cursors` holds the cursor that fetched each page
// visited so far (null for the first), and previous pops it. Mounted keyed by
// pool id, so another pool starts again from its own first page.
const TradesFeedTable = ({ pool }: { pool: PoolOverview }) => {
  const [limit, setLimit] = useState<CursorPaging["limit"]>("20")
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const cursor = cursors[cursors.length - 1]
  const page = cursors.length

  const params = new URLSearchParams({ limit })
  if (cursor) params.set("cursor", cursor)
  // No keepPreviousData: what is shown is always the requested page's own
  // result (or its loading or error state), never the page before it.
  const { data, error, isLoading, isValidating, mutate } = useSWR<
    TradesPage,
    TradesError
  >(`/api/pools/${pool.id}/trades?${params}`, fetchTrades, {
    revalidateOnFocus: false,
    // The first page refreshes for new swaps; a loaded older page does not
    // change. SWR pauses the interval while the last fetch failed.
    refreshInterval: page === 1 ? 60 * 1000 : 0,
    // Failed and unavailable fetches (any page) retry every 30 s, not on
    // SWR's growing backoff.
    onErrorRetry: (_err, _key, _config, revalidate, opts) => {
      setTimeout(() => revalidate(opts), 30 * 1000)
    },
  })

  const onFirst = () => setCursors([null])
  const onPrev = () => setCursors((c) => (c.length > 1 ? c.slice(0, -1) : c))

  // Loading, failed or unavailable: the message for this page, with a way
  // back to newer pages and a retry.
  const notice = (text: string | null, retry: boolean) => (
    <div className="w-full space-y-2">
      <div className="flex items-center justify-end gap-2">
        <span className="text-sm text-muted-foreground" aria-live="polite">
          Page {page}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={page === 1}
          onClick={onFirst}
          aria-label="First page"
        >
          <ChevronsLeft className="size-4" />
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          disabled={page === 1}
          onClick={onPrev}
          aria-label="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
      </div>
      {text === null ? (
        <Loading />
      ) : (
        <Message>
          <div className="flex max-w-md flex-col items-center gap-3">
            <p className="text-muted-foreground">{text}</p>
            {retry && (
              <Button
                size="sm"
                variant="outline"
                disabled={isValidating}
                onClick={() => mutate()}
              >
                <RotateCw
                  className={cn("mr-2 size-3", isValidating && "animate-spin")}
                />
                Retry
              </Button>
            )}
          </div>
        </Message>
      )}
    </div>
  )

  // A notice only when this page has nothing to show yet; once loaded, a
  // failed refresh leaves the rows in place.
  if (!data) {
    if (!error || isLoading) return notice(null, false)
    return notice(
      error.reason ? UNAVAILABLE_TEXT[error.reason] : "Unable to load swaps",
      true
    )
  }

  const nextCursor = data.nextCursor
  const paging: CursorPaging = {
    page,
    hasNext: nextCursor !== null,
    // Locks the paging buttons while this page refetches.
    loading: isValidating,
    limit,
    onFirst,
    onPrev,
    onNext: () => {
      if (nextCursor) setCursors((c) => [...c, nextCursor])
    },
    onLimitChange: (next) => {
      // Cursors are positions in the feed, but a page boundary depends on the
      // page size: start again from the newest swap.
      setLimit(next)
      setCursors([null])
    },
  }

  return (
    <TransactionTableContent
      pool={pool}
      swaps={data.swaps}
      extraDenoms={data.extraDenoms}
      paging={paging}
      emptyMessage={
        page === 1 ? "No swaps recorded for this pool yet." : "No older swaps."
      }
    />
  )
}

const TransactionTable = ({
  pool,
  swaps,
  tradesFeed = false,
}: {
  pool: PoolOverview
  swaps: Promise<SwapsResult> | null
  // Read the SQS trade feed (client-fetched) instead of the streamed swaps.
  tradesFeed?: boolean
}) => {
  return (
    <Card className="w-full">
      <CardHeader className="text-center md:text-start">
        <CardTitle>Recent Swaps</CardTitle>
        <CardDescription>
          {tradesFeed ? (
            <>
              Swaps through the pool, newest first. Value is the USD value at
              the time of the swap.
            </>
          ) : (
            <>
              Up to the latest {ACTIVITY_MAX_SWAPS.toLocaleString("en-US")}{" "}
              swaps from the past 7 days, with the amounts that entered and left
              the pool
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {tradesFeed || !swaps ? (
          <TradesFeedTable key={pool.id} pool={pool} />
        ) : (
          <Suspense fallback={<Loading />}>
            <Await resolve={swaps}>
              {(result) =>
                result.ok ? (
                  <TransactionTableContent
                    pool={pool}
                    swaps={result.swaps}
                    contractNames={result.contractNames}
                    extraDenoms={result.extraDenoms}
                  />
                ) : (
                  <Message>
                    <p className="text-muted-foreground">
                      Unable to load swaps
                    </p>
                  </Message>
                )
              }
            </Await>
          </Suspense>
        )}
      </CardContent>
    </Card>
  )
}
TransactionTable.displayName = "TransactionTable"

export { TransactionTable }
