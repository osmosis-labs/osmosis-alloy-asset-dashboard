import { MetadataRoute } from "next"
import { getPoolsOverview } from "@/services/pool"

import { env } from "@/env.mjs"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pools = (await getPoolsOverview().then(({ pools }) =>
    pools.map((pool) => ({
      url: `${env.NEXT_PUBLIC_APP_URL}/pools/${pool.id}`,
      changeFrequency: "hourly",
    }))
  )) satisfies MetadataRoute.Sitemap

  return [
    {
      url: `${env.NEXT_PUBLIC_APP_URL}`,
      changeFrequency: "hourly",
    },
    {
      url: `${env.NEXT_PUBLIC_APP_URL}/pools`,
      changeFrequency: "hourly",
    },
    ...pools,
  ]
}
