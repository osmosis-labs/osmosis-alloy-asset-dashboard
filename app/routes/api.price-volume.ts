import { getPoolsOverview } from "@/services/pool"
import { getPriceVolumeChart } from "@/services/price-volume"

import { PRICE_VOLUME_CHART_TIMEFRAME } from "@/lib/timeframe"

import type { Route } from "./+types/api.price-volume"

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const denom = url.searchParams.get("denom")
  const tf = url.searchParams.get("tf")
  // Own keys only: `in` would accept inherited names such as "toString".
  if (!denom || !tf || !Object.hasOwn(PRICE_VOLUME_CHART_TIMEFRAME, tf)) {
    return Response.json({ error: "bad request" }, { status: 400 })
  }
  try {
    // Only the alloys the dashboard lists (the pool page's chart). Any other
    // denom would be a fresh upstream fetch and a new cache entry per request.
    const { pools } = await getPoolsOverview()
    if (!pools.some((p) => p.alloy.asset?.denom === denom)) {
      return Response.json({ error: "not found" }, { status: 404 })
    }

    const data = await getPriceVolumeChart(
      denom,
      tf as keyof typeof PRICE_VOLUME_CHART_TIMEFRAME
    )
    return Response.json(data, {
      headers: { "Cache-Control": "public, max-age=3600" },
    })
  } catch (e) {
    console.error(`[api/price-volume] ${denom} ${tf}: ${e}`)
    return Response.json({ error: "unavailable" }, { status: 502 })
  }
}
