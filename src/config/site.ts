import { SiteConfig } from "@/types"

import { env } from "@/env.mjs"

export const siteConfig: SiteConfig = {
  name: "Osmosis Alloy Asset Dashboard",
  author: "yoisha",
  description: "Dashboard for Osmosis Alloy Asset.",
  keywords: [],
  url: {
    base: env.NEXT_PUBLIC_APP_URL,
    author: "https://x.com/yyyoisha",
  },
  links: {
    github: "https://github.com/osmosis-labs",
  },
  ogImage: `${env.NEXT_PUBLIC_APP_URL}/og.jpg`,
}
