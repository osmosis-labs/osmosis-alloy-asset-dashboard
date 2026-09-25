import { Prisma, PrismaClient } from "@prisma/client"

import { fetchLcd } from "@/lib/utils"

import { blockTime, latestHeight } from "./activity-ingest"

// Pool reserve snapshots for the "Backing Over Time" chart: each alloy pool's
// accounted reserves per denom at a block height, from the transmuter's own
// get_total_pool_liquidity query (excludes stray tokens sent to the contract,
// which the raw bank balance would include). Historical heights need an
// archive node, and lcd.osmosis.zone blocks contract queries, so this always
// goes to the archive. No Next.js imports.

export const ARCHIVE_HOSTS = ["https://lcd.archive.osmosis.zone"]

const archiveJson = async (
  path: string,
  { height, hosts = ARCHIVE_HOSTS }: { height?: number; hosts?: string[] } = {}
) => {
  let lastError: unknown
  for (const host of hosts) {
    try {
      const res = await fetchLcd(`${host}${path}`, {
        timeoutMs: 30000,
        headers: height ? { "x-cosmos-block-height": String(height) } : {},
      })
      const body = await res.json().catch(() => null)
      if (res.ok) return body
      lastError = new Error(
        `${host} returned ${res.status}: ${String(body?.message ?? "").slice(0, 160)}`
      )
    } catch (e) {
      lastError = e
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`LCD failed: ${path}`)
}

export const poolContractAddress = async (
  poolId: string,
  hosts = ARCHIVE_HOSTS
): Promise<string> => {
  const data = await archiveJson(
    `/osmosis/poolmanager/v1beta1/pools/${poolId}`,
    {
      hosts,
    }
  )
  const address = data?.pool?.contract_address
  if (!address) throw new Error(`pool ${poolId} has no contract address`)
  return address
}

// The pool's reserves at `height`, or null if the contract did not exist yet.
export const poolLiquidityAt = async (
  contractAddress: string,
  height: number,
  hosts = ARCHIVE_HOSTS
): Promise<{ denom: string; amount: string }[] | null> => {
  const query = Buffer.from(
    JSON.stringify({ get_total_pool_liquidity: {} })
  ).toString("base64")
  try {
    const data = await archiveJson(
      `/cosmwasm/wasm/v1/contract/${contractAddress}/smart/${query}`,
      { height, hosts }
    )
    return data?.data?.total_pool_liquidity ?? []
  } catch (e) {
    // Before instantiation the contract is simply unknown at that height.
    if (/not found|no such contract/i.test(String(e))) return null
    throw e
  }
}

// Pure: next height estimate towards `target` given a measured block and the
// block rate.
export const correctHeight = (
  height: number,
  heightTime: number,
  target: number,
  msPerBlock: number
) => Math.round(height + (target - heightTime) / msPerBlock)

export type ChainTip = { height: number; time: number }

export const chainTip = async (hosts = ARCHIVE_HOSTS): Promise<ChainTip> => {
  const height = await latestHeight(hosts)
  return { height, time: (await blockTime(height, hosts)).getTime() }
}

// Block height at (approximately, within a few blocks) `target`. Estimates
// from the tip at ~1.2s per block, then corrects against measured block times.
// Pass `tip` when resolving many dates to avoid re-fetching it each time.
export const heightAtTime = async (
  target: Date,
  { hosts = ARCHIVE_HOSTS, tip }: { hosts?: string[]; tip?: ChainTip } = {}
): Promise<{ height: number; time: Date }> => {
  const { height: tipHeight, time: tipTime } = tip ?? (await chainTip(hosts))
  let height = correctHeight(tipHeight, tipTime, target.getTime(), 1200)
  let time = tipTime
  for (let i = 0; i < 3; i++) {
    time = (await blockTime(height, hosts)).getTime()
    if (Math.abs(time - target.getTime()) < 60_000) break
    const msPerBlock = (tipTime - time) / (tipHeight - height) || 1200
    height = Math.min(
      correctHeight(height, time, target.getTime(), msPerBlock),
      tipHeight
    )
  }
  return { height, time: new Date(time) }
}

export const writeSnapshot = async (
  db: PrismaClient,
  poolId: string,
  height: number,
  ts: Date,
  liquidity: { denom: string; amount: string }[]
) => {
  if (liquidity.length === 0) return 0
  const { count } = await db.poolReserveSnapshot.createMany({
    data: liquidity.map((l) => ({
      poolId,
      height: BigInt(height),
      ts,
      denom: l.denom,
      amount: new Prisma.Decimal(l.amount),
    })),
    skipDuplicates: true,
  })
  return count
}

// Cron step: one snapshot per pool per day, at the run's tip.
const SNAPSHOT_INTERVAL_MS = 24 * 60 * 60 * 1000

export const snapshotPoolIfDue = async ({
  db,
  poolId,
  contractAddress,
  height,
  ts,
}: {
  db: PrismaClient
  poolId: string
  contractAddress: string
  height: number
  ts: Date
}) => {
  const last = await db.poolReserveSnapshot.findFirst({
    where: { poolId },
    orderBy: { ts: "desc" },
    select: { ts: true },
  })
  if (last && ts.getTime() - last.ts.getTime() < SNAPSHOT_INTERVAL_MS) {
    return { poolId, snapshot: "not due" as const }
  }
  const liquidity = await poolLiquidityAt(contractAddress, height)
  const rows = liquidity
    ? await writeSnapshot(db, poolId, height, ts, liquidity)
    : 0
  return { poolId, snapshot: rows }
}
