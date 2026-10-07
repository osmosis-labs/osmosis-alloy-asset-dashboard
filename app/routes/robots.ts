import { env } from "@/env.mjs"

// Only production is indexed. SITE_ENV is "production" for the live Worker
// and "preview" for pull-request previews. Without it (local dev) everything
// is indexable.
export function loader() {
  const indexable = process.env.SITE_ENV
    ? process.env.SITE_ENV === "production"
    : true
  const body = indexable
    ? `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${env.NEXT_PUBLIC_APP_URL}/sitemap.xml\n`
    : "User-agent: *\nDisallow: /\n"
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "public, max-age=300",
    },
  })
}
