import { useEffect, useRef } from "react"
import { useRevalidator } from "react-router"

// Keeps an open tab from going stale. The loader data is sent once and
// otherwise never updates in the browser; revalidate() re-runs the loaders
// (served from the data cache, so it does not hit the LCD or SQS) while
// keeping client state such as a half-filled swap form. Paused while the tab
// is hidden; a tab that comes back after the interval refreshes straight away.
const AutoRefresh = ({
  intervalMs = 5 * 60 * 1000,
}: {
  intervalMs?: number
}) => {
  const { revalidate } = useRevalidator()
  const lastRefresh = useRef(Date.now())

  useEffect(() => {
    const refresh = () => {
      lastRefresh.current = Date.now()
      revalidate()
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
  }, [revalidate, intervalMs])

  return null
}
AutoRefresh.displayName = "AutoRefresh"

export { AutoRefresh }
