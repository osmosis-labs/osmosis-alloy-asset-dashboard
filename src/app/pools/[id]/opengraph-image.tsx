import { ImageResponse } from "next/og"
import { getPoolOverview, isMigrationPool } from "@/services/pool"

import { Asset } from "@/types/asset"
import { NumberFormatter } from "@/lib/number"
import { reserveAmount, variantSymbol } from "@/lib/pool-sources"
import {
  SHARE_IMAGE_SIZE,
  ShareImage,
  ShareRow,
} from "@/components/og/share-image"

export const alt = "Osmosis Alloyed Asset"
export const size = SHARE_IMAGE_SIZE
export const contentType = "image/png"
// Same cadence as the pool page.
export const revalidate = 300

// Next 15: route params arrive as a Promise.
export default async function Image({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const pool = await getPoolOverview(id)
  if (!pool) {
    return new ImageResponse(
      <ShareImage eyebrow="Osmosis" title="Alloyed Assets" lines={[]} />,
      size
    )
  }

  const total = pool.reserveCoins.reduce(
    (acc, c) => acc + reserveAmount(c.currency),
    0
  )
  const tvl = pool.alloy.price
    ? `$${NumberFormatter.formatCompactValue(Number(pool.alloy.price.amount) * total)} backing`
    : null
  // Each variant's share, most prevalent first (reserveCoins is sorted that
  // way). Past five rows the smallest are summed into "Others".
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

  return new ImageResponse(
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
    size
  )
}

// The alloy's logo as a data: URI, so a slow or missing image host cannot
// fail the whole image: the PNG where the assetlist has one (next/og draws
// PNG reliably), else the SVG. null when neither loads in time.
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
