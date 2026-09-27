import type { PoolsOverviewResult } from "@/services/pool"

import dayjs from "@/lib/dayjs"

// Shown when the pools data is not from a live build: an upstream the build
// needs was down, so the page is serving the last good copy (the runtime
// last-known-good tier or the committed snapshot, see src/services/pool.ts).
const DataFreshnessNotice = ({
  source,
  builtAt,
}: Pick<PoolsOverviewResult, "source" | "builtAt">) => {
  if (!source || source === "live") return null
  const when = builtAt
    ? dayjs.utc(builtAt).format("D MMM YYYY, HH:mm [UTC]")
    : "an earlier build"
  return (
    <div
      role="status"
      className="w-full rounded-md border border-amber-500/50 bg-amber-500/10 p-2 text-start text-sm"
    >
      Live pool data is temporarily unavailable. Showing data from {when}.
    </div>
  )
}
DataFreshnessNotice.displayName = "DataFreshnessNotice"

export { DataFreshnessNotice }
