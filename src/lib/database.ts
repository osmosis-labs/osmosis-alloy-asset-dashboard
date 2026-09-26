import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"

// Same pattern as OSMOscope's lib/database.ts. Prisma 7 connects through a
// driver adapter; prefer the pooled URL at runtime (serverless).
const connectionString =
  process.env.POSTGRES_PRISMA_URL ||
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL

// Whether the activity store is configured. Everything that reads or writes
// it checks this first and falls back to the live LCD path when false.
export const isDatabaseEnabled = (): boolean => !!connectionString

// Reuse one client per process in development (hot reload would otherwise
// open a new pool on every edit).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const getPrisma = (): PrismaClient => {
  if (!connectionString) {
    throw new Error("Activity store is not configured (no database URL)")
  }
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }),
      log:
        process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    })
  }
  return globalForPrisma.prisma
}
