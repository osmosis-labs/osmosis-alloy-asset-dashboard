export type PriceVolume = {
  time: number
  highLow: [number, number]
  volume: number
  average: number
}

export type PriceVolumeRaw = {
  time: number
  high: number
  low: number
  close: number
  open: number
  volume: number
}

//* 5     - 5 minutes
//* 15    - 15 minutes
//* 30    - 30 minutes
//* 60    - 1 hour also known as '1H' in chart
//* 120   - 2 hours
//* 240   - 4 hours
//* 720   - 12 hours
//* 1440  - 1 day also known as '1D' in chart
//* 10080 - 1 week also known as '1W' in chart
//* 43800 - 1 month also known as '30D' in chart
export const PRICE_VOLUME_CHART_TIMEFRAME = {
  "6 Hours": [5, 72], // 5 minutes per candle, 72 candles
  "12 Hours": [15, 48], // 5 minutes per candle, 144 candles
  "1 Day": [30, 48], // 30 minutes per candle, 48 candles
  "3 Days": [60, 72], // 1 hour per candle, 72 candles
  "7 Days": [240, 60], // 4 hours per candle, 60 candles
  "1 Month": [720, 60], // 12 hours per candle, 60 candles
  "3 Months": [1440, 90], // 1 day per candle, 90 candles
  "6 Months": [10080, 26], // 1 week per candle, 26 candles
  "1 Year": [10080, 52], // 1 week per candle, 52 candles
} as const
export type Timeframe = keyof typeof PRICE_VOLUME_CHART_TIMEFRAME
export const TIMEFRAMES = Object.keys(
  PRICE_VOLUME_CHART_TIMEFRAME
) as Timeframe[]
