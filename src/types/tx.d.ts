// One swap through a pool, from its `token_swapped` event. A multi-hop or
// multi-message tx can contribute several rows (one per event on the pool).
export type PoolSwap = {
  hash: string
  height: number
  timestamp: string
  success: boolean
  // The swap's `sender` attribute: the account or contract that executed it
  // (an IBC-hooks or router contract for routed swaps), not the fee payer.
  sender: string
  // Short type of the message that emitted the event, e.g. "SwapExactAmountIn",
  // "RecvPacket", "ExecuteContract".
  action: string
  in: { amount: string; denom: string }
  out: { amount: string; denom: string }
}
