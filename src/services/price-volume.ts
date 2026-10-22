import { dataCache } from "@/lib/data-cache"
import {
  PRICE_VOLUME_CHART_TIMEFRAME,
  PriceVolume,
  PriceVolumeRaw,
} from "@/lib/timeframe"

export const getPriceVolumeChart = dataCache(
  async (denom: string, tf: keyof typeof PRICE_VOLUME_CHART_TIMEFRAME) => {
    if (!Object.hasOwn(PRICE_VOLUME_CHART_TIMEFRAME, tf)) {
      throw new Error("Invalid timeframe")
    }
    const [timeframe, count] = PRICE_VOLUME_CHART_TIMEFRAME[tf]
    // Serialized, not interpolated, so a denom cannot add or override fields.
    const input = JSON.stringify({
      json: {
        coinMinimalDenom: denom,
        timeFrame: {
          custom: { timeFrame: timeframe, numRecentFrames: count },
        },
      },
    })
    return await fetch(
      `https://app.osmosis.zone/api/edge-trpc-assets/assets.getAssetHistoricalPrice?input=${encodeURIComponent(input)}`
    )
      .then((res) => res.json())
      .then((d) => d.result.data.json as PriceVolumeRaw[])
      .then(
        (d) =>
          d.map((p) => {
            const avg = (p.open + p.close) / 2
            return {
              time: p.time,
              highLow: [p.high, p.low] as const,
              average: avg,
              volume: p.volume,
            }
          }) as PriceVolume[]
      )
  },
  ["price-volume-chart"],
  {
    revalidate: 3600,
  }
)
