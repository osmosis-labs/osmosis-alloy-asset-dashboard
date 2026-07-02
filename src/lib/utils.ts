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
