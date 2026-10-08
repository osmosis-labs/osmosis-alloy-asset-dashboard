import { ImageResponse } from "@vercel/og"
import { getPoolOverview, isMigrationPool } from "@/services/pool"

import { Asset } from "@/types/asset"
import { NumberFormatter } from "@/lib/number"
import { reserveAmount, variantSymbol } from "@/lib/pool-sources"
import {
  SHARE_IMAGE_SIZE,
  ShareImage,
  ShareRow,
} from "@/components/og/share-image"

import type { Route } from "./+types/pools.$id.opengraph"
import { cachedImage } from "../og-response"

// The alloy's logo as a data: URI, so a slow or missing image host cannot
// fail the whole image. null when neither the PNG nor the SVG loads in time.
const logoDataUri = async (asset: Asset): Promise<string | null> => {
  const image = asset.images?.find((i) => i.png || i.svg)
  const url = image?.png || image?.svg
  if (!url) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const type = url.endsWith(".svg") ? "image/svg+xml" : "image/png"
    const body = Buffer.from(await res.arrayBuffer()).toString("base64")
    return `data:${type};base64,${body}`
  } catch {
    return null
  }
}

export async function loader({ params }: Route.LoaderArgs) {
  const pool = await getPoolOverview(params.id)
  if (!pool) {
    return cachedImage(
      new ImageResponse(
        <ShareImage eyebrow="Osmosis" title="Alloyed Assets" lines={[]} />,
        SHARE_IMAGE_SIZE
      )
    )
  }

  const total = pool.reserveCoins.reduce(
    (acc, c) => acc + reserveAmount(c.currency),
    0
  )
  const tvl = pool.alloy.price
    ? `$${NumberFormatter.formatCompactValue(Number(pool.alloy.price.amount) * total)} backing`
    : null
  const shares: ShareRow[] = pool.reserveCoins.map((c) => ({
    label: variantSymbol(c) ?? "Unknown",
    percent: total > 0 ? (reserveAmount(c.currency) / total) * 100 : 0,
  }))
  const rows =
    shares.length > 5
      ? [
          ...shares.slice(0, 4),
          {
            label: "Others",
            percent: shares.slice(4).reduce((acc, r) => acc + r.percent, 0),
          },
        ]
      : shares

  return cachedImage(
    new ImageResponse(
      (
        <ShareImage
          eyebrow={
            isMigrationPool(pool)
              ? "Osmosis Migration Alloy"
              : "Osmosis Alloyed Asset"
          }
          title={pool.alloy.asset.symbol}
          logo={await logoDataUri(pool.alloy.asset)}
          subtitle={tvl}
          shares={rows}
        />
      ),
      SHARE_IMAGE_SIZE
    )
  )
}
