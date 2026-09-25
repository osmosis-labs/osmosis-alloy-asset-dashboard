// Unit tests for the activity store's pure logic. Run: pnpm test:activity
// (The SQL in writeEvents is exercised against a real database, not here.)
import assert from "node:assert/strict"
import path from "node:path"
import { test } from "node:test"
import { pathToFileURL } from "node:url"

const { swapEventsFromTx, bucketFlows, flowPointsFromSwaps } = await import(
  pathToFileURL(path.resolve("src/services/swap-rows.ts")).href
)
const { selectCompleteHeights, bucketRange, isLastPage } = await import(
  pathToFileURL(path.resolve("src/services/activity-ingest.ts")).href
)

const swapped = (
  poolId: string,
  msgIndex: number,
  sender = "osmo1adapter"
) => ({
  type: "token_swapped",
  attributes: [
    { key: "module", value: "gamm" },
    { key: "pool_id", value: poolId },
    { key: "sender", value: sender },
    { key: "tokens_in", value: "500000000ibc/NOBLE" },
    { key: "tokens_out", value: "499000000factory/osmo1x/alloyed/allUSDC" },
    { key: "msg_index", value: String(msgIndex) },
  ],
})

const tx = (messages: any[], events: any[], height = 100) => ({
  txhash: "ABC",
  height: String(height),
  timestamp: "2026-09-25T12:07:00Z",
  code: 0,
  tx: { body: { messages } },
  events,
})

test("IBC hooks swap is attributed to the packet's source-chain sender", () => {
  const packet = Buffer.from(JSON.stringify({ sender: "inj1bot" })).toString(
    "base64"
  )
  const events = swapEventsFromTx(
    tx(
      [
        {
          "@type": "/ibc.core.client.v1.MsgUpdateClient",
          signer: "osmo1relayer",
        },
        {
          "@type": "/ibc.core.channel.v1.MsgRecvPacket",
          signer: "osmo1relayer",
          packet: { data: packet },
        },
      ],
      [{ type: "message", attributes: [] }, swapped("3497", 1)]
    ),
    "3497"
  )
  assert.equal(events.length, 1)
  assert.equal(events[0].sender, "inj1bot")
  assert.equal(events[0].action, "RecvPacket")
  assert.equal(events[0].msgIndex, 1)
  assert.equal(events[0].eventIndex, 1)
  assert.deepEqual(events[0].in, { amount: "500000000", denom: "ibc/NOBLE" })
})

test("router call is attributed to the calling wallet, not the adapter", () => {
  const [e] = swapEventsFromTx(
    tx(
      [
        {
          "@type": "/cosmwasm.wasm.v1.MsgExecuteContract",
          sender: "osmo1wallet",
        },
      ],
      [swapped("3497", 0)]
    ),
    "3497"
  )
  assert.equal(e.sender, "osmo1wallet")
  assert.equal(e.action, "ExecuteContract")
})

test("authz swap is attributed to the granter", () => {
  const [e] = swapEventsFromTx(
    tx(
      [
        {
          "@type": "/cosmos.authz.v1beta1.MsgExec",
          grantee: "osmo1grantee",
          msgs: [
            {
              "@type": "/osmosis.poolmanager.v1beta1.MsgSwapExactAmountIn",
              sender: "osmo1granter",
            },
          ],
        },
      ],
      [swapped("3497", 0)]
    ),
    "3497"
  )
  assert.equal(e.sender, "osmo1granter")
  assert.equal(e.action, "SwapExactAmountIn")
})

test("events on other pools are ignored", () => {
  const events = swapEventsFromTx(
    tx(
      [{ "@type": "/x.MsgSwap", sender: "osmo1a" }],
      [swapped("1868", 0), swapped("3497", 0)]
    ),
    "3497"
  )
  assert.equal(events.length, 1)
  assert.equal(events[0].eventIndex, 1)
})

const ev = (height: number) => ({ height }) as any

test("exhausted range keeps every event and covers to the end", () => {
  const r = selectCompleteHeights([ev(5), ev(9)], {
    from: 0,
    to: 20,
    exhausted: true,
  })
  assert.equal(r.events.length, 2)
  assert.equal(r.coveredTo, 20)
})

test("page-capped range drops the possibly split last height", () => {
  const r = selectCompleteHeights([ev(5), ev(9), ev(9)], {
    from: 0,
    to: 20,
    exhausted: false,
  })
  assert.deepEqual(
    r.events.map((e: any) => e.height),
    [5]
  )
  assert.equal(r.coveredTo, 8)
})

test("capped range with no events makes no progress", () => {
  const r = selectCompleteHeights([], { from: 7, to: 20, exhausted: false })
  assert.equal(r.coveredTo, 7)
})

test("bucket range is aligned to 15 minutes and covers every event", () => {
  const { start, end } = bucketRange([
    { timestamp: "2026-09-25T12:07:00Z" },
    { timestamp: "2026-09-25T12:31:59Z" },
  ] as any)
  assert.equal(start.toISOString(), "2026-09-25T12:00:00.000Z")
  assert.equal(end.toISOString(), "2026-09-25T12:45:00.000Z")
})

test("bucketFlows zero-fills gaps and halves the swap count", () => {
  const t0 = Date.parse("2026-09-25T10:00:00Z")
  const points = [
    { time: t0, denom: "a", amountIn: "10", amountOut: "0", swaps: 1 },
    { time: t0, denom: "b", amountIn: "0", amountOut: "10", swaps: 1 },
    {
      time: t0 + 30 * 60_000,
      denom: "a",
      amountIn: "5",
      amountOut: "0",
      swaps: 1,
    },
    {
      time: t0 + 30 * 60_000,
      denom: "b",
      amountIn: "0",
      amountOut: "5",
      swaps: 1,
    },
  ]
  const buckets = bucketFlows(points)
  // 30-minute span -> 5-minute buckets -> 7 columns, empty ones included.
  assert.equal(buckets.length, 7)
  assert.equal(buckets[0].count, 1)
  assert.deepEqual(buckets[0].in, { a: "10" })
  assert.deepEqual(buckets[0].out, { b: "10" })
  assert.deepEqual(buckets[1].in, {})
})

test("bucketFlows respects the minimum bucket and the window start", () => {
  const from = Date.parse("2026-09-24T12:00:00Z")
  const t = Date.parse("2026-09-25T11:50:00Z")
  const buckets = bucketFlows(
    [{ time: t, denom: "a", amountIn: "1", amountOut: "0", swaps: 1 }],
    { minBucketMinutes: 15, from }
  )
  // Data up to 11:50 from a 12:00 start -> 24 hourly buckets.
  assert.equal(buckets[0].timestamp, "2026-09-24T12:00:00.000Z")
  assert.equal(buckets.length, 24)
})

test("flowPointsFromSwaps emits one in and one out point per swap", () => {
  const points = flowPointsFromSwaps([
    {
      timestamp: "2026-09-25T12:00:00Z",
      in: { amount: "3", denom: "a" },
      out: { amount: "2", denom: "b" },
    },
  ] as any)
  assert.deepEqual(
    points.map((p: any) => [p.denom, p.amountIn, p.amountOut]),
    [
      ["a", "3", "0"],
      ["b", "0", "2"],
    ]
  )
})

test("a full page is the last page when it reaches the reported total", () => {
  assert.equal(isLastPage(1, 100, 100), true) // exactly 100 txs: no page 2
  assert.equal(isLastPage(1, 100, 250), false)
  assert.equal(isLastPage(3, 50, 250), true) // short page
  assert.equal(isLastPage(1, 100, NaN), false) // total missing: rely on page size
})

const { correctHeight } = await import(
  pathToFileURL(path.resolve("src/services/reserves.ts")).href
)

test("height correction moves towards the target at the measured block rate", () => {
  // 1,000 blocks at 1.2s is 20 minutes: a block 20 min late should step back 1,000.
  assert.equal(correctHeight(5000, 1_200_000, 0, 1200), 4000)
  assert.equal(correctHeight(5000, 0, 600_000, 1200), 5500)
})

test("long ranges get coarse buckets within the column cap", () => {
  const day = 86_400_000
  const end = Date.parse("2026-09-25T00:00:00Z")
  for (const [days, minutes] of [
    [7, 360],
    [30, 1440],
    [90, 4320],
    [365, 20160],
  ]) {
    const buckets = bucketFlows(
      [{ time: end, denom: "a", amountIn: "1", amountOut: "0", swaps: 1 }],
      { minBucketMinutes: 15, from: end - days * day }
    )
    assert.ok(buckets.length <= 32, `${days}d -> ${buckets.length} columns`)
    const step =
      Date.parse(buckets[1].timestamp) - Date.parse(buckets[0].timestamp)
    assert.equal(step, minutes * 60_000, `${days}d bucket size`)
  }
})

const { coveredThroughTime } = await import(
  pathToFileURL(path.resolve("src/services/activity-ingest.ts")).href
)
const { floorToStoreBucket } = await import(
  pathToFileURL(path.resolve("src/services/swap-rows.ts")).href
)

test("covered-through time: tip on a full run, last event when capped", () => {
  const upToTime = new Date("2026-09-25T12:00:00Z")
  const events = [
    { height: 90, timestamp: "2026-09-23T10:00:00Z" },
    { height: 95, timestamp: "2026-09-23T11:00:00Z" },
  ] as any
  assert.equal(
    coveredThroughTime({ coveredTo: 100, upTo: 100, upToTime, events }),
    upToTime
  )
  // Capped far behind the tip: two-day-old events must not read as fresh.
  assert.equal(
    coveredThroughTime({
      coveredTo: 96,
      upTo: 100,
      upToTime,
      events,
    })?.toISOString(),
    "2026-09-23T11:00:00.000Z"
  )
  assert.equal(
    coveredThroughTime({ coveredTo: 80, upTo: 100, upToTime, events: [] }),
    null
  )
})

test("flow reads start at the bucket straddling the window start", () => {
  const from = Date.parse("2026-09-25T12:07:00Z")
  assert.equal(
    new Date(floorToStoreBucket(from)).toISOString(),
    "2026-09-25T12:00:00.000Z"
  )
})
