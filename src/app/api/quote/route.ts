import { NextRequest, NextResponse } from "next/server"

export const revalidate = 0

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const poolId = searchParams.get("poolId")
  const amountIn = searchParams.get("amountIn") || "100"
  const denomIn = searchParams.get("denomIn")
  const denomOut = searchParams.get("denomOut")

  if (!poolId || !denomIn || !denomOut) {
    return NextResponse.json(
      { message: "Missing required parameters: poolId, denomIn, denomOut" },
      { status: 400 }
    )
  }

  const url = `https://sqsprod.osmosis.zone/router/custom-direct-quote?tokenIn=${amountIn}${encodeURIComponent(denomIn)}&tokenOutDenom=${encodeURIComponent(denomOut)}&poolID=${poolId}`

  try {
    const response = await fetch(url)

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json(
        { message: errorText || `Failed to fetch quote: ${response.status} ${response.statusText}` },
        { status: response.status }
      )
    }

    const data = await response.json()
    return NextResponse.json(data)
  } catch (e: any) {
    console.error(`Error fetching quote: ${e.message}`)
    return NextResponse.json(
      { message: e.message || "Failed to fetch quote" },
      { status: 500 }
    )
  }
}
