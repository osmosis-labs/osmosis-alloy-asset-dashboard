import { Metadata } from "next"
import Link from "next/link"

import { SwapPage } from "@/components/swap-page"

export const metadata: Metadata = {
  title: "Transmuter Swap",
  description:
    "Swap 1:1 between an Osmosis alloyed asset and its variants, directly through the alloy's pool contract.",
}

// Next 15: search params arrive as a Promise.
type SwapRouteProps = {
  searchParams: Promise<{ pool?: string | string[] }>
}

// ?pool={id} opens the form on that pool (links from the pool pages).
export default async function Swap({ searchParams }: SwapRouteProps) {
  const { pool } = await searchParams
  const initialPoolId = typeof pool === "string" ? pool : undefined

  return (
    <main className="container my-6 flex flex-1 flex-col items-center gap-6 text-center">
      <div className="max-w-[500px] space-y-2">
        <h1 className="text-2xl font-semibold">Transmuter Swap</h1>
        <p className="text-sm text-muted-foreground">
          Swap 1:1 between an alloyed asset and one of its variants, directly
          through the alloy&apos;s pool contract, up to the amount of that
          variant the pool holds. To trade other assets, use the{" "}
          <Link
            href="https://app.osmosis.zone/swap"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Osmosis app
          </Link>
          .
        </p>
      </div>
      <SwapPage initialPoolId={initialPoolId} />
    </main>
  )
}
