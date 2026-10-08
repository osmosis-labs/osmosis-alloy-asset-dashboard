import { PrismaPg } from "@prisma/adapter-pg"
import * as PrismaNode from "@prisma/client"
import * as PrismaEdge from "@prisma/client/edge"

import { requestStore } from "@/lib/request-context"

// Prisma's Node entry compiles its query-compiler Wasm at runtime, which
// Cloudflare Workers forbid. The generated client's workerd condition points
// at the edge entry, which imports that Wasm as a module. Vite cannot resolve
// the `.prisma/client` specifier under pnpm, so the Worker build aliases it
// (vite.config.mts) and the workerd condition selects the edge entry. Scripts
// run in Node, where `navigator` is absent, and keep the Node entry. Static
// imports: a runtime require() is not defined in the Worker.
const PrismaNS =
  typeof navigator !== "undefined" &&
  navigator.userAgent === "Cloudflare-Workers"
    ? PrismaEdge
    : PrismaNode
type PrismaClient = PrismaNode.PrismaClient
const PrismaClient = PrismaNS.PrismaClient

// Same pattern as OSMOscope's lib/database.ts. Prisma 7 connects through a
// driver adapter; prefer the pooled URL at runtime (serverless).
const connectionString =
  process.env.POSTGRES_PRISMA_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL

// Whether the activity store is configured. Everything that reads or writes
// it checks this first and falls back to the live LCD path when false.
export const isDatabaseEnabled = (): boolean => !!connectionString

const createClient = () =>
  new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })

// On Cloudflare Workers a database connection belongs to the request that
// opened it: a module-level pool reused by a later request fails ("Cannot
// perform I/O on behalf of a different request"). There each request gets its
// own client, keyed on that request's execution context. Everywhere else
// (local dev, scripts, the cron runner) one client is shared, so hot reload
// doesn't open a new pool on every edit.
type CloudflareContext = { ctx: object }
const requestContext = (): CloudflareContext | undefined =>
  requestStore.getStore() ??
  (globalThis as unknown as Record<symbol, CloudflareContext | undefined>)[
    Symbol.for("__cloudflare-context__")
  ]
const perRequest = new WeakMap<object, PrismaClient>()
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const getPrisma = (): PrismaClient => {
  if (!connectionString) {
    throw new Error("Activity store is not configured (no database URL)")
  }
  const cf = requestContext()
  if (cf?.ctx) {
    let client = perRequest.get(cf.ctx)
    if (!client) {
      client = createClient()
      perRequest.set(cf.ctx, client)
    }
    return client
  }
  globalForPrisma.prisma ??= createClient()
  return globalForPrisma.prisma
}
