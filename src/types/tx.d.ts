// One swap through a pool, from its `token_swapped` event. A multi-hop or
// multi-message tx can contribute several rows (one per event on the pool).
export type PoolSwap = {
  hash: string
  height: number
  timestamp: string
  success: boolean
  // The account behind the swap (see swapAccount): the wallet, the authz
  // granter, the wallet calling a router contract, or for IBC-hooks swaps the
  // source-chain sender (e.g. an inj1... address). Not the executing contract.
  sender: string
  // Short type of the message that emitted the event, e.g. "SwapExactAmountIn",
  // "RecvPacket", "ExecuteContract".
  action: string
  // Contract that routed the swap (router call target or IBC-hooks memo
  // contract); absent for direct swaps and for rows stored before this field.
  contract?: string
  in: { amount: string; denom: string }
  out: { amount: string; denom: string }
}
