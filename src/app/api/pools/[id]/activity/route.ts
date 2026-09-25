import { NextResponse } from "next/server"
import { getPoolInOutAssets } from "@/services/pool"

import { ACTIVITY_RANGE_DAYS } from "@/lib/activity"

// Pool activity for one date range, for the client-side activity chart (the
// range is chosen in the browser and shared across the page's charts).
// getPoolInOutAssets is cached per pool and range.
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
    return NextResponse.json(await getPoolInOutAssets(params.id, range))
  } catch (e) {
    console.error(`[api/activity] pool ${params.id} ${range}: ${e}`)
    return NextResponse.json({ error: "unavailable" }, { status: 502 })
  }
}
