import { getPoolsOverview } from "@/services/pool"

import { env } from "@/env.mjs"

export async function loader() {
  const { pools } = await getPoolsOverview()
  const urls = [
    env.NEXT_PUBLIC_APP_URL,
    `${env.NEXT_PUBLIC_APP_URL}/pools`,
    ...pools.map((pool) => `${env.NEXT_PUBLIC_APP_URL}/pools/${pool.id}`),
  ]
  const escapeXml = (value: string) =>
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (url) => `  <url>
    <loc>${escapeXml(url)}</loc>
    <changefreq>hourly</changefreq>
  </url>`
  )
  .join("\n")}
</urlset>`
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml",
      "Cache-Control": "public, max-age=300",
    },
  })
}
