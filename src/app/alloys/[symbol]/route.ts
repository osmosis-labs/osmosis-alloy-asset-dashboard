import { NextResponse } from "next/server"
import { getPoolsOverview } from "@/services/pool"

// Stable links by alloy: /alloys/allBTC (case-insensitive) redirects to the
// pool page of the pool that currently issues it, so a link keeps working if
// an alloy moves to a new pool (allUSDC moved from pool 2321 to 3497). A full
// alloyed denom (factory/{contract}/alloyed/{symbol}, URL-encoded) works too.
// An alloy without a page of its own (under the listing cutoff, or not an
// alloy at all) goes to /pools, which lists every alloyed pool, so links from
// app.osmosis.zone for any alloy land somewhere useful. Temporary redirects,
// since the pool behind an alloy can change.
export const revalidate = 300
export const maxDuration = 60

// Next 15: route params arrive as a Promise.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ symbol: string }> }
) {
  const { symbol } = await params
  const wanted = decodeURIComponent(symbol).toLowerCase()
  const { pools } = await getPoolsOverview()
  const pool = pools.find((p) => {
    const denom = p.alloy.asset.denom.toLowerCase()
    return denom === wanted || denom.split("/").at(-1) === wanted
  })
  const target = pool ? `/pools/${pool.id}` : "/pools"
  return NextResponse.redirect(new URL(target, request.url), 307)
}
