import { type RouteConfig, index, route } from "@react-router/dev/routes"

export default [
  index("routes/home.tsx"),
  route("pools", "routes/pools.tsx"),
  route("pools/:id", "routes/pools.$id.tsx"),
  route("swap", "routes/swap.tsx"),
  route("alloys/:symbol", "routes/alloys.$symbol.tsx"),
  route("api/pools", "routes/api.pools.ts"),
  route("api/pools/:id/activity", "routes/api.pools.$id.activity.ts"),
  route("api/cron/activity", "routes/api.cron.activity.ts"),
  route("api/price-volume", "routes/api.price-volume.ts"),
  route("sitemap.xml", "routes/sitemap.ts"),
  route("robots.txt", "routes/robots.ts"),
  route("opengraph-image", "routes/opengraph.tsx"),
  route("pools/:id/opengraph-image", "routes/pools.$id.opengraph.tsx"),
  route("*", "routes/not-found.tsx"),
] satisfies RouteConfig
