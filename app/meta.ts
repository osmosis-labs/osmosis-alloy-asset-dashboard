import { siteConfig } from "@/config/site"

// One title, description and share card per page. Nested routes each return
// this; React Router keeps the deepest tag when the name or property matches.
export const pageMeta = ({
  title,
  description,
  path = "/",
  image = "/opengraph-image",
}: {
  title?: string
  description?: string
  path?: string
  image?: string
} = {}) => {
  const fullTitle = title ? `${title} | ${siteConfig.name}` : siteConfig.name
  const desc = description ?? siteConfig.description
  const url = new URL(path, siteConfig.url.base).toString()
  const imageUrl = new URL(image, siteConfig.url.base).toString()
  return [
    { title: fullTitle },
    { name: "description", content: desc },
    { name: "keywords", content: siteConfig.keywords.join(", ") },
    { name: "author", content: siteConfig.author },
    { property: "og:type", content: "website" },
    { property: "og:locale", content: "en_US" },
    { property: "og:url", content: url },
    { property: "og:title", content: fullTitle },
    { property: "og:description", content: desc },
    { property: "og:site_name", content: siteConfig.name },
    { property: "og:image", content: imageUrl },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: fullTitle },
    { name: "twitter:description", content: desc },
    { name: "twitter:creator", content: "@osmosiszone" },
    { name: "twitter:image", content: imageUrl },
  ]
}

// HTML documents for the cached pages. Errors stay uncached so a 404 does
// not stick for a pool that was just listed.
export const cachedPageHeaders = ({
  errorHeaders,
}: {
  errorHeaders?: Headers | null
}) =>
  errorHeaders
    ? { "Cache-Control": "no-store" }
    : { "Cache-Control": "public, max-age=300" }
