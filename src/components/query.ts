"use server"

import { unstable_cache } from "next/cache"

import {
  PRICE_VOLUME_CHART_TIMEFRAME,
  PriceVolume,
  PriceVolumeRaw,
} from "../lib/timeframe"

export const getPriceVolumeChart = unstable_cache(
  async (denom: string, tf: keyof typeof PRICE_VOLUME_CHART_TIMEFRAME) => {
    if (!PRICE_VOLUME_CHART_TIMEFRAME[tf]) {
      throw new Error("Invalid timeframe")
    }
    const [timeframe, count] = PRICE_VOLUME_CHART_TIMEFRAME[tf]
    return await fetch(
      `https://app.osmosis.zone/api/edge-trpc-assets/assets.getAssetHistoricalPrice?input=%7B%22json%22%3A%7B%22coinMinimalDenom%22%3A%22${denom}%22%2C%22timeFrame%22%3A%7B%22custom%22%3A%7B%22timeFrame%22%3A${timeframe}%2C%22numRecentFrames%22%3A${count}%7D%7D%7D%7D`
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
