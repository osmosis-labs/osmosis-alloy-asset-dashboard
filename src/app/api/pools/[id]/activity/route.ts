import { NextResponse } from "next/server"
import { getDenomMetaSafe } from "@/services/denom-meta"
import { getPoolInOutAssets } from "@/services/pool"
import _ from "lodash"

import { ACTIVITY_RANGE_DAYS } from "@/lib/activity"

// Pool activity for one date range, for the client-side activity chart (the
// range is chosen in the browser and shared across the page's charts).
// getPoolInOutAssets is cached per pool and range. `denoms` carries symbol and
// decimals for every denom in the activity, so the chart can show variants
// that are no longer in the pool's current reserves.
export const dynamic = "force-dynamic"
// The live fallback can take a while (up to 10 LCD pages).
export const maxDuration = 60

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const range = new URL(request.url).searchParams.get("range") ?? "24h"
  if (!(range in ACTIVITY_RANGE_DAYS) || !/^\d+$/.test(params.id)) {
    return NextResponse.json({ error: "bad request" }, { status: 400 })
  }
  try {
    const activity = await getPoolInOutAssets(params.id, range)
    const denoms = await getDenomMetaSafe(
      _.uniq(
        activity.activities.flatMap((a) => [..._.keys(a.in), ..._.keys(a.out)])
      )
    )
    return NextResponse.json({ ...activity, denoms })
  } catch (e) {
    console.error(`[api/activity] pool ${params.id} ${range}: ${e}`)
    return NextResponse.json({ error: "unavailable" }, { status: 502 })
  }
}
