import { SiteConfig } from "@/types"

import { env } from "@/env.mjs"

export const siteConfig: SiteConfig = {
  name: "Osmosis Alloyed Assets",
  // Original author of the dashboard.
  author: "yoisha",
  // Current maintainer.
  maintainer: "Osmosis Labs",
  description:
    "Live composition, backing and flows of Osmosis alloyed assets: allBTC, allUSDC, allETH, allUSDT and more.",
  keywords: ["Osmosis", "alloyed assets", "allBTC", "transmuter"],
  url: {
    base: env.NEXT_PUBLIC_APP_URL,
    author: "https://x.com/yyyoisha",
    maintainer: "https://github.com/osmosis-labs",
  },
  links: {
    github: "https://github.com/osmosis-labs/osmosis-alloy-asset-dashboard",
    app: "https://app.osmosis.zone",
    docs: "https://docs.osmosis.zone/learn/features/alloyed-assets",
  },
}
