import { SwapPage } from "@/components/swap-page"

import { pageMeta } from "../meta"
import type { Route } from "./+types/swap"

export const meta: Route.MetaFunction = () =>
  pageMeta({
    title: "Transmuter Swap",
    description:
      "Swap 1:1 between an Osmosis alloyed asset and its variants, directly through the alloy's pool contract.",
    path: "/swap",
  })

export function loader({ request }: Route.LoaderArgs) {
  const pool = new URL(request.url).searchParams.get("pool")
  return { initialPoolId: pool ?? undefined }
}

export default function Swap({ loaderData }: Route.ComponentProps) {
  return (
    <main className="container my-6 flex flex-1 flex-col items-center gap-6 text-center">
      <div className="max-w-[500px] space-y-2">
        <h1 className="text-2xl font-semibold">Transmuter Swap</h1>
        <p className="text-sm text-muted-foreground">
          Swap 1:1 between an alloyed asset and one of its variants, directly
          through the alloy&apos;s pool contract, up to the amount of that
          variant the pool holds. To trade other assets, use the{" "}
          <a
            href="https://app.osmosis.zone/swap"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Osmosis app
          </a>
          .
        </p>
      </div>
      <SwapPage initialPoolId={loaderData.initialPoolId} />
    </main>
  )
}
