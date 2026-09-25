import { SiteConfig } from "@/types"

import { env } from "@/env.mjs"

export const siteConfig: SiteConfig = {
  name: "Osmosis Alloy Asset Dashboard",
  // Original author of the dashboard.
  author: "yoisha",
  // Current maintainer.
  maintainer: "Osmosis Labs",
  description: "Dashboard for Osmosis Alloy Asset.",
  keywords: [],
  url: {
    base: env.NEXT_PUBLIC_APP_URL,
    author: "https://x.com/yyyoisha",
    maintainer: "https://github.com/osmosis-labs",
  },
  links: {
    github: "https://github.com/osmosis-labs",
  },
  ogImage: `${env.NEXT_PUBLIC_APP_URL}/og.jpg`,
}
