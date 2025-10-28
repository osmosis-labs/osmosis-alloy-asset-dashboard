import { unstable_noStore } from "next/cache"

import { Quote } from "@/types/quote"

const BASE_URL =
  "https://sqsprod.osmosis.zone/router/quote?tokenIn={tokenIn}&tokenOutDenom={tokenOutDenom}"
const BASE_DIRECT_URL =
  "https://sqs.osmosis.zone/router/custom-direct-quote?tokenIn={tokenIn}&tokenOutDenom={tokenOutDenom}&poolID={poolId}"

export const getBaseQuote = async (denomIn: string, denomOut: string) => {
  unstable_noStore()

  return getQuote("100", denomIn, denomOut)
}

export const getQuote = async (
  amountIn: string,
  denomIn: string,
  denomOut: string
) => {
  unstable_noStore()

  const url = BASE_URL.replace(
    "{tokenIn}",
    `${amountIn}${encodeURIComponent(denomIn)}`
  ).replace("{tokenOutDenom}", encodeURIComponent(denomOut))

  try {
    const response = await fetch(url)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        errorText || `Failed to fetch quote: ${response.status} ${response.statusText}`
      )
    }

    const data = await response.json()
    return data as Quote
  } catch (e: any) {
    console.error(`Error fetching quote: ${e.message}`)
    throw e
  }
}

export const getBaseDirectQuote = async (
  poolId: string,
  denomIn: string,
  denomOut: string
) => {
  unstable_noStore()

  return getDirectQuote(poolId, "100", denomIn, denomOut)
}

export const getDirectQuote = async (
  poolId: string,
  amountIn: string,
  denomIn: string,
  denomOut: string
) => {
  unstable_noStore()

  const url = BASE_DIRECT_URL.replace(
    "{tokenIn}",
    `${amountIn}${encodeURIComponent(denomIn)}`
  )
    .replace("{tokenOutDenom}", encodeURIComponent(denomOut))
    .replace("{poolId}", poolId)

  try {
    const response = await fetch(url)

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(
        errorText || `Failed to fetch direct quote: ${response.status} ${response.statusText}`
      )
    }

    const data = await response.json()
    return data as Quote
  } catch (e: any) {
    console.error(`Error fetching direct quote: ${e.message}`)
    throw e
  }
}
