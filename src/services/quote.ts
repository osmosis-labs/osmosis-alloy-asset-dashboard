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

  const response = await fetch(url).then((res) => res.json())

  return response as Quote
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

  const response = await fetch(url).then((res) => res.json())

  return response as Quote
}
