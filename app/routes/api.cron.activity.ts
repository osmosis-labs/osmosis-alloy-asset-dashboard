import { GET } from "@/services/cron-activity"

import type { Route } from "./+types/api.cron.activity"

export function loader({ request }: Route.LoaderArgs) {
  return GET(request)
}
