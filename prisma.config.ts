import "dotenv/config"

import { defineConfig } from "prisma/config"

// The Prisma CLI (db push) needs a direct, non-pooled connection; set
// DATABASE_URL (the unpooled names are kept for older env files).
// `prisma generate` needs no database, so an empty URL is fine for builds,
// which don't get the database secret.
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
