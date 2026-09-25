import "dotenv/config"

import { defineConfig } from "prisma/config"

// The Prisma CLI (db push) needs a direct, non-pooled connection. Vercel's
// Postgres / Neon integration sets one of these; set DATABASE_URL manually if
// none is present. `prisma generate` needs no database, so an empty URL is
// fine for builds before the store is connected.
const directUrl =
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL ||
  ""

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: directUrl,
  },
})
