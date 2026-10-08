import { ImageResponse } from "@vercel/og"

import { SHARE_IMAGE_SIZE, ShareImage } from "@/components/og/share-image"
import { cachedImage } from "../og-response"

export function loader() {
  return cachedImage(
    new ImageResponse(
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
      SHARE_IMAGE_SIZE
    )
  )
}
