import { MetadataRoute } from "next"

import { env } from "@/env.mjs"

// Only production is indexed. On Cloudflare, SITE_ENV is "production" for
// the live Worker and "preview" for pull-request previews (wrangler.jsonc,
// and a Workers Builds build variable, since this is prerendered at build).
// Without SITE_ENV (local dev) everything is indexable.
const indexable = process.env.SITE_ENV
  ? process.env.SITE_ENV === "production"
  : true

export default function robots(): MetadataRoute.Robots {
  return {
    rules: indexable
      ? { userAgent: "*", allow: "/", disallow: "/api/" }
      : { userAgent: "*", disallow: "/" },
    sitemap: `${env.NEXT_PUBLIC_APP_URL}/sitemap.xml`,
  }
}
