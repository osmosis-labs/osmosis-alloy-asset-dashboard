"use client"

import { createContext, ReactNode, useContext, useState } from "react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// One date range shared by every chart on a page: picking 90D on one chart
// switches them all. Charts rendered outside a DateRangeProvider (e.g. the
// home page's liquidity overview) keep their own local range.

export const DATE_RANGES = [
  { value: "24h", label: "24H", days: 1 },
  { value: "7d", label: "7D", days: 7 },
  { value: "30d", label: "30D", days: 30 },
  { value: "90d", label: "90D", days: 90 },
  { value: "180d", label: "180D", days: 180 },
  { value: "1y", label: "1Y", days: 365 },
  { value: "all", label: "All", days: null },
] as const

export type DateRange = (typeof DATE_RANGES)[number]["value"]
export const DEFAULT_DATE_RANGE: DateRange = "90d"

export const dateRangeDays = (range: DateRange): number | null =>
  DATE_RANGES.find((r) => r.value === range)?.days ?? null

type DateRangeState = { range: DateRange; setRange: (r: DateRange) => void }
const DateRangeContext = createContext<DateRangeState | null>(null)

export const DateRangeProvider = ({
  children,
  defaultRange = DEFAULT_DATE_RANGE,
}: {
  children: ReactNode
  defaultRange?: DateRange
}) => {
  const [range, setRange] = useState<DateRange>(defaultRange)
  return (
    <DateRangeContext.Provider value={{ range, setRange }}>
      {children}
    </DateRangeContext.Provider>
  )
}

export const useDateRange = (
  fallback: DateRange = DEFAULT_DATE_RANGE
): DateRangeState => {
  const shared = useContext(DateRangeContext)
  const [range, setRange] = useState<DateRange>(fallback)
  return shared ?? { range, setRange }
}

export const DateRangeSelect = ({
  range,
  setRange,
}: {
  range: DateRange
  setRange: (r: DateRange) => void
}) => (
  <Select value={range} onValueChange={(v) => setRange(v as DateRange)}>
    <SelectTrigger
      className="w-[96px] rounded-lg sm:ml-auto"
      aria-label="Date range"
    >
      <SelectValue>
        {DATE_RANGES.find((r) => r.value === range)?.label}
      </SelectValue>
    </SelectTrigger>
    <SelectContent className="rounded-xl">
      {DATE_RANGES.map((r) => (
        <SelectItem key={r.value} value={r.value} className="rounded-lg">
          {r.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
)
