import { NextResponse } from "next/server"
import { getDenomMetaSafe } from "@/services/denom-meta"
import { getPoolInOutAssets, getPoolOverview } from "@/services/pool"
import _ from "lodash"

import { ACTIVITY_RANGE_DAYS } from "@/lib/activity"

// Pool activity for one date range, for the client-side activity chart (the
// range is chosen in the browser and shared across the page's charts).
// getPoolInOutAssets is cached per pool and range. `denoms` carries symbol and
// decimals for every denom in the activity, so the chart can show variants
// that are no longer in the pool's current reserves.
export const dynamic = "force-dynamic"

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Next 15: route params arrive as a Promise.
  const { id } = await params
  const range = new URL(request.url).searchParams.get("range") ?? "24h"
  if (!(range in ACTIVITY_RANGE_DAYS) || !/^\d+$/.test(id)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 })
  }
  // Only pools the dashboard lists. Any other id would send the live
  // fallback's LCD tx search (up to 11 requests) to an arbitrary pool, and a
  // loop over ids could get the deployment's IP banned by the LCD. Ids are
  // matched exactly, so "0001868" is not an alias for "1868".
  if (!(await getPoolOverview(id))) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }
  try {
    const activity = await getPoolInOutAssets(id, range)
    const denoms = await getDenomMetaSafe(
      _.uniq(
        activity.activities.flatMap((a) => [..._.keys(a.in), ..._.keys(a.out)])
      )
    )
    return NextResponse.json({ ...activity, denoms })
  } catch (e) {
    console.error(`[api/activity] pool ${id} ${range}: ${e}`)
    return NextResponse.json({ error: "unavailable" }, { status: 502 })
  }
}
