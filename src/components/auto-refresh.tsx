"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

// Keeps an open tab from going stale. Server-rendered pages are sent once and
// otherwise never update in the browser; router.refresh() re-requests the
// server components (served from the ISR cache, so it does not hit the LCD or
// SQS) while keeping client state such as a half-filled swap form. Paused
// while the tab is hidden; a tab that comes back after the interval refreshes
// straight away.
const AutoRefresh = ({
  intervalMs = 5 * 60 * 1000,
}: {
  intervalMs?: number
}) => {
  const router = useRouter()
  const lastRefresh = useRef(Date.now())

  useEffect(() => {
    const refresh = () => {
      lastRefresh.current = Date.now()
      router.refresh()
    }
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh()
    }, intervalMs)
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastRefresh.current >= intervalMs
      ) {
        refresh()
      }
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [router, intervalMs])

  return null
}
AutoRefresh.displayName = "AutoRefresh"

export { AutoRefresh }
