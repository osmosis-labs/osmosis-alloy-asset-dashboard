import { ImageResponse } from "next/og"

import { SHARE_IMAGE_SIZE, ShareImage } from "@/components/og/share-image"

export const alt = "Osmosis Alloyed Assets"
export const size = SHARE_IMAGE_SIZE
export const contentType = "image/png"

export default function Image() {
  return new ImageResponse(
    (
      <ShareImage
        eyebrow="Osmosis"
        title="Alloyed Assets"
        lines={[
          "Live composition, backing and flows",
          "allBTC · allUSDC · allETH · allUSDT and more",
        ]}
      />
    ),
    size
  )
}
