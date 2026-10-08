import { getDenomMetaSafe } from "@/services/denom-meta"
import { getPoolInOutAssets, getPoolOverview } from "@/services/pool"
import _ from "lodash"

import { ACTIVITY_RANGE_DAYS } from "@/lib/activity"

import type { Route } from "./+types/api.pools.$id.activity"

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  })

export async function loader({ request, params }: Route.LoaderArgs) {
  const range = new URL(request.url).searchParams.get("range") ?? "24h"
  const id = params.id
  if (!(range in ACTIVITY_RANGE_DAYS) || !/^\d+$/.test(id)) {
    return json({ error: "bad request" }, 400)
  }
  // Only pools the dashboard lists. Any other id would send the live
  // fallback's LCD tx search to an arbitrary pool. Ids are matched exactly,
  // so "0001868" is not an alias for "1868".
  if (!(await getPoolOverview(id))) {
    return json({ error: "not found" }, 404)
  }
  try {
    const activity = await getPoolInOutAssets(id, range)
    const denoms = await getDenomMetaSafe(
      _.uniq(
        activity.activities.flatMap((a) => [..._.keys(a.in), ..._.keys(a.out)])
      )
    )
    return json({ ...activity, denoms })
  } catch (e) {
    console.error(`[api/activity] pool ${id} ${range}: ${e}`)
    return json({ error: "unavailable" }, 502)
  }
}
