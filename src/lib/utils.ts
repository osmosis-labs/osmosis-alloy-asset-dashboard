import { clsx, type ClassValue } from "clsx"
import _ from "lodash"
import { twMerge } from "tailwind-merge"

import { Asset } from "@/types/asset"

export const getAssetImageUrl = (asset: Asset) => {
  return asset?.images?.[0]?.svg || asset?.images?.[0]?.png
}

/**
 * fetch wrapper that retries transient failures (network errors, TLS
 * renegotiation, 5xx, 429) with exponential backoff and a per-attempt timeout.
 * Upstreams the dashboard depends on (SQS, LCD, the osmosis edge tRPC API)
 * occasionally drop the first connection; a single un-retried fetch turns that
 * blip into a blank card or a blank page. 4xx other than 429 are not retried
 * because they will not succeed on a retry.
 */
export const fetchWithRetry = async (
  input: string | URL,
  init?: RequestInit & { retries?: number; timeoutMs?: number }
): Promise<Response> => {
  const { retries = 2, timeoutMs = 15000, ...rest } = init ?? {}

  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(input, {
        ...rest,
        signal: rest.signal ?? controller.signal,
      })

      // Retry on transient server-side statuses only.
      if (response.status >= 500 || response.status === 429) {
        lastError = new Error(`Upstream returned ${response.status}`)
      } else {
        return response
      }
    } catch (e) {
      lastError = e
    } finally {
      clearTimeout(timer)
    }

    if (attempt < retries) {
      // 250ms, 500ms, 1000ms ... backoff.
      await new Promise((r) => setTimeout(r, 250 * 2 ** attempt))
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`fetchWithRetry failed for ${String(input)}`)
}

// lcd.osmosis.zone bans any IP that makes more than 20 requests within 1s for
// 12h (fail2ban; every response status counts, 429s included) and rate-limits
// to 5 req/s with a burst of 10. Request STARTS are spaced process-wide so the
// pool pages rendering in one function instance or build worker stay under
// both. Slow responses still overlap; only the starts are paced. A build
// prerenders pool pages in ~3 worker processes behind one IP, so 700ms keeps
// their combined rate (~4.3 req/s) under the 5 req/s limit.
const LCD_MIN_INTERVAL_MS = 700
let lcdNextSlotAt = 0

const waitForLcdSlot = async () => {
  const now = Date.now()
  const slotAt = Math.max(now, lcdNextSlotAt)
  lcdNextSlotAt = slotAt + LCD_MIN_INTERVAL_MS
  if (slotAt > now) {
    await new Promise((r) => setTimeout(r, slotAt - now))
  }
}

/**
 * fetch for lcd.osmosis.zone: every attempt waits for a paced slot, and only
 * network errors and 5xx are retried. 429 and 403 are returned as-is: a 429
 * retry is one more request toward the fail2ban threshold, and a 403 is the
 * ban itself, which a retry cannot lift.
 */
export const fetchLcd = async (
  input: string | URL,
  init?: RequestInit & { retries?: number; timeoutMs?: number }
): Promise<Response> => {
  const { retries = 1, timeoutMs = 15000, ...rest } = init ?? {}

  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    await waitForLcdSlot()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(input, {
        ...rest,
        signal: rest.signal ?? controller.signal,
      })
      if (response.status >= 500) {
        lastError = new Error(`Upstream returned ${response.status}`)
      } else {
        return response
      }
    } catch (e) {
      lastError = e
    } finally {
      clearTimeout(timer)
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`fetchLcd failed for ${String(input)}`)
}

/**
 * Like fetchWithRetry, but the JSON body read is inside the retry loop and
 * under the per-attempt timeout. fetchWithRetry resolves as soon as headers
 * arrive, so a connection dropped mid-body ("TypeError: terminated", "other
 * side closed") surfaces later in response.json() with no retry. Large bodies
 * such as the multi-MB assetlists hit exactly that from Vercel. Each URL in
 * `inputs` is tried in order (e.g. a primary then a mirror), each with its own
 * retry budget. Non-2xx responses throw; 4xx other than 429 skip the remaining
 * retries for that URL.
 */
export const fetchJsonWithRetry = async <T = unknown>(
  inputs: string | URL | (string | URL)[],
  init?: RequestInit & { retries?: number; timeoutMs?: number }
): Promise<T> => {
  const { retries = 2, timeoutMs = 15000, ...rest } = init ?? {}
  const urls = _.castArray(inputs)

  let lastError: unknown
  for (const input of urls) {
    for (let attempt = 0; attempt <= retries; attempt++) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), timeoutMs)
      try {
        const response = await fetch(input, {
          ...rest,
          signal: rest.signal ?? controller.signal,
        })

        if (!response.ok) {
          lastError = new Error(
            `Upstream returned ${response.status} for ${String(input)}`
          )
          // Discard the body so the socket can be released.
          await response.body?.cancel().catch(() => {})
          if (response.status < 500 && response.status !== 429) break
        } else {
          return (await response.json()) as T
        }
      } catch (e) {
        lastError = e
      } finally {
        clearTimeout(timer)
      }

      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 250 * 2 ** attempt))
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`fetchJsonWithRetry failed for ${urls.map(String).join(", ")}`)
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const camelizeKeys = (obj: any): any => {
  if (_.isArray(obj)) {
    return obj.map((v) => camelizeKeys(v))
  } else if (_.isPlainObject(obj)) {
    return Object.keys(obj).reduce(
      (result, key) => ({
        ...result,
        [_.camelCase(key)]: camelizeKeys(obj[key]),
      }),
      {}
    )
  }
  return obj
}

export const capitalName = (name: string) => {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export const percentColorCn = (value?: number) => {
  if (!value || value === 1) {
    return "text-muted-foreground"
  } else if (value > 1) {
    return "text-green-400"
  } else {
    return "text-red-400"
  }
}
