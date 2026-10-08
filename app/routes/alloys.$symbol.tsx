import { redirect } from "react-router"
import { getPoolsOverview } from "@/services/pool"

import type { Route } from "./+types/alloys.$symbol"

// Stable links by alloy: /alloys/allBTC (case-insensitive) redirects to the
// pool page of the pool that currently issues it, so a link keeps working if
// an alloy moves to a new pool. A full alloyed denom works too. An alloy
// without a page of its own goes to /pools. Temporary redirects, since the
// pool behind an alloy can change.
export async function loader({ request, params }: Route.LoaderArgs) {
  const wanted = decodeURIComponent(params.symbol).toLowerCase()
  const { pools } = await getPoolsOverview()
  const pool = pools.find((p) => {
    const denom = p.alloy.asset.denom.toLowerCase()
    return denom === wanted || denom.split("/").at(-1) === wanted
  })
  const target = pool ? `/pools/${pool.id}` : "/pools"
  throw redirect(new URL(target, request.url).toString(), 307)
}
