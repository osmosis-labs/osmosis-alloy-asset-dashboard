import { getPriceVolumeChart } from "@/services/price-volume"

import { PRICE_VOLUME_CHART_TIMEFRAME } from "@/lib/timeframe"

import type { Route } from "./+types/api.price-volume"

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url)
  const denom = url.searchParams.get("denom")
  const tf = url.searchParams.get("tf")
  if (!denom || !tf || !(tf in PRICE_VOLUME_CHART_TIMEFRAME)) {
    return Response.json({ error: "bad request" }, { status: 400 })
  }
  try {
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
