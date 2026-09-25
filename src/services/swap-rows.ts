import BigNumber from "bignumber.js"
import _ from "lodash"

import { PoolInOutAssets } from "@/types/pool"
import { PoolSwap } from "@/types/tx"

// Pure helpers shared by the live LCD path (src/services/pool.ts), the activity
// store ingest (src/services/activity-ingest.ts) and the backfill script. No
// Next.js imports so the script and tests can load them directly.

const ASSET_AMOUNT_REGEX = /([0-9]+)(.+)/

// Short message type ("/osmosis.poolmanager.v1beta1.MsgSwapExactAmountIn" ->
// "SwapExactAmountIn"), unwrapping authz MsgExec to the message it ran.
export const shortMessageType = (message: any): string => {
  if (message?.["@type"] === "/cosmos.authz.v1beta1.MsgExec") {
    return shortMessageType(_.last(message.msgs as any[]))
  }
  const type = String(_.last(String(message?.["@type"] ?? "").split(".")))
  return type.replace(/^Msg/, "") || "Unknown"
}

// The account behind a swap. The token_swapped `sender` attribute is whoever
// executed the swap, which for routed swaps is a contract (e.g. Skip's swap
// adapter executes every Skip router call and IBC-hooks swap), so unrelated
// users collapse onto one address. Resolve from the message instead:
//   - authz MsgExec: the inner message's sender (the granter, whose funds move)
//   - MsgRecvPacket (IBC hooks): the packet's source-chain sender; the Osmosis
//     signer is only the relayer
//   - anything else with a sender (direct swaps, MsgExecuteContract): it
//   - otherwise: the event attribute
export const swapAccount = (message: any, eventSender: string | undefined) => {
  const type = message?.["@type"]
  if (type === "/cosmos.authz.v1beta1.MsgExec") {
    const inner = _.find(message.msgs as any[], (m) => m?.sender)
    if (inner?.sender) return inner.sender as string
  }
  if (type === "/ibc.core.channel.v1.MsgRecvPacket") {
    try {
      const data = JSON.parse(atob(message.packet?.data ?? ""))
      if (typeof data?.sender === "string" && data.sender) return data.sender
    } catch {
      // Not an ICS-20 packet; fall through to the event sender.
    }
  }
  if (type !== "/ibc.core.channel.v1.MsgRecvPacket" && message?.sender) {
    return message.sender as string
  }
  return eventSender ?? ""
}

// A PoolSwap plus the indexes that make it unique within its tx (the store's
// primary key is pool + tx hash + msg index + event index).
export type SwapEvent = PoolSwap & { msgIndex: number; eventIndex: number }

// Every token_swapped event on `poolId` in an LCD tx response.
export const swapEventsFromTx = (tx: any, poolId: string): SwapEvent[] =>
  _.flatMap(tx?.events ?? [], (e: any, eventIndex: number) => {
    if (
      e?.type !== "token_swapped" ||
      !_.some(
        e.attributes,
        (a: any) => a.key === "pool_id" && a.value === poolId
      )
    ) {
      return []
    }
    const attr = (key: string) =>
      _.find(e.attributes, ["key", key])?.value as string | undefined
    const [, amountIn, denomIn] =
      (attr("tokens_in") ?? "").match(ASSET_AMOUNT_REGEX) ?? []
    const [, amountOut, denomOut] =
      (attr("tokens_out") ?? "").match(ASSET_AMOUNT_REGEX) ?? []
    const rawMsgIndex = Number(attr("msg_index"))
    const msgIndex = Number.isInteger(rawMsgIndex) ? rawMsgIndex : -1
    const message =
      msgIndex >= 0
        ? tx.tx?.body?.messages?.[msgIndex]
        : _.last(tx.tx?.body?.messages)

    return [
      {
        hash: tx.txhash,
        height: Number(tx.height),
        timestamp: tx.timestamp,
        success: tx.code === 0,
        sender: swapAccount(message, attr("sender")),
        action: shortMessageType(message),
        in: { amount: amountIn ?? "0", denom: denomIn ?? "" },
        out: { amount: amountOut ?? "0", denom: denomOut ?? "" },
        msgIndex,
        eventIndex,
      },
    ]
  })

// Bucket sizes the activity chart can use. The data spans anything from ~5h
// (a busy pool's latest live swaps) to a year of stored history, so the bucket
// is chosen from the actual span to keep at most MAX_ACTIVITY_BUCKETS columns.
const ACTIVITY_BUCKET_MINUTES = [
  5, 10, 15, 30, 60, 120, 240, 360, 720, 1440, 2880, 4320, 10080, 20160,
]
// 24H -> hourly, 7D -> 6-hourly, 30D -> daily, 90D -> 3-daily, 1Y -> 2-weekly.
const MAX_ACTIVITY_BUCKETS = 32

export const pickActivityBucketMinutes = (spanMinutes: number) =>
  ACTIVITY_BUCKET_MINUTES.find(
    (step) => Math.floor(spanMinutes / step) + 1 <= MAX_ACTIVITY_BUCKETS
  ) ?? _.last(ACTIVITY_BUCKET_MINUTES)!

// Per-bucket, per-denom in/out amounts (base units as decimal strings).
export type FlowPoint = {
  time: number // ms
  denom: string
  amountIn: string
  amountOut: string
  swaps: number
}

// Merge flow points into adaptive buckets for the chart. Every bucket between
// the first and last point is emitted, including empty ones: the x-axis is
// categorical, so a missing bucket would silently squeeze time together.
// `minBucketMinutes` stops merging below the source resolution (15 for the
// store's 15-minute rollups).
export const bucketFlows = (
  points: FlowPoint[],
  {
    minBucketMinutes = 0,
    from,
  }: { minBucketMinutes?: number; from?: number } = {}
): PoolInOutAssets[] => {
  if (points.length === 0) return []
  const earliest = from ?? _.minBy(points, "time")!.time
  const latest = _.maxBy(points, "time")!.time
  const bucketMs =
    Math.max(
      pickActivityBucketMinutes((latest - earliest) / 60_000),
      minBucketMinutes
    ) * 60_000
  const toBucket = (time: number) => Math.floor(time / bucketMs) * bucketMs
  const byBucket = _.groupBy(points, (p) => toBucket(p.time))

  return _.range(toBucket(earliest), toBucket(latest) + 1, bucketMs).map(
    (bucket) => {
      const v = byBucket[bucket] ?? []
      const sumBy = (key: "amountIn" | "amountOut") =>
        _.chain(v)
          .filter((p) => p[key] !== "0")
          .groupBy("denom")
          .mapValues((ps) =>
            _.reduce(
              ps,
              (sum, p) => sum.plus(p[key]),
              new BigNumber(0)
            ).toString()
          )
          .value()
      return {
        timestamp: new Date(bucket).toISOString(),
        // Each swap touches two denoms (one in, one out), so it is counted
        // twice across the denom rows.
        count: Math.round(_.sumBy(v, "swaps") / 2),
        in: sumBy("amountIn"),
        out: sumBy("amountOut"),
      }
    }
  )
}

// Flow points for individual swaps: one point for the input denom and one for
// the output denom.
export const flowPointsFromSwaps = (swaps: PoolSwap[]): FlowPoint[] =>
  _.flatMap(swaps, (s) => {
    const time = new Date(s.timestamp).getTime()
    return [
      {
        time,
        denom: s.in.denom,
        amountIn: s.in.amount,
        amountOut: "0",
        swaps: 1,
      },
      {
        time,
        denom: s.out.denom,
        amountIn: "0",
        amountOut: s.out.amount,
        swaps: 1,
      },
    ]
  })
