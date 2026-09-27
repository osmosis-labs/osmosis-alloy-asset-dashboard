import { ImageResponse } from "next/og"
import { getPoolOverview, isMigrationPool } from "@/services/pool"

import { NumberFormatter } from "@/lib/number"
import { reserveAmount, variantSymbol } from "@/lib/pool-sources"
import { SHARE_IMAGE_SIZE, ShareImage } from "@/components/og/share-image"

export const alt = "Osmosis alloyed asset"
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
  const variants = pool.reserveCoins.map((c) => variantSymbol(c)).join(" · ")

  return new ImageResponse(
    (
      <ShareImage
        eyebrow={
          isMigrationPool(pool)
            ? "Osmosis migration alloy"
            : "Osmosis alloyed asset"
        }
        title={pool.alloy.asset.symbol}
        lines={[tvl, `Backed by ${variants}`].filter((l): l is string => !!l)}
      />
    ),
    size
  )
}
