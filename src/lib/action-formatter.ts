import BigNumber from "bignumber.js"
import _ from "lodash"

import { AssetWithDecimal } from "@/types/asset"
import { PoolTransaction } from "@/types/tx"

export const actionFormatter = (
  messages: PoolTransaction["transaction"]["messages"],
  assets: _.Dictionary<AssetWithDecimal>
) => {
  let message = _.last(messages)!.detail
  const isAuthz = message["@type"] === "/cosmos.authz.v1beta1.MsgExec"
  if (isAuthz) message = _.last(message.msgs as any[])

  if (
    [
      "/osmosis.gamm.v1beta1.MsgSwapExactAmountIn",
      "/osmosis.poolmanager.v1beta1.MsgSwapExactAmountIn",
    ].includes(message["@type"])
  ) {
    const denomIn = message.token_in.denom as string
    const amountIn = new BigNumber(message.token_in.amount)
      .shiftedBy(-assets[denomIn].decimal)
      .toNumber()
    const denomOut = _.last(message.routes as any[]).token_out_denom as string
    const minAmountOut = new BigNumber(message.token_out_min_amount)
      .shiftedBy(-assets[denomOut].decimal)
      .toNumber()

    return {
      type: "Swap",
      amountIn: amountIn,
      assetIn: assets[denomIn],
      minAmountOut: minAmountOut,
      assetOut: assets[denomOut],
    } as const
  }

  if (
    ["/osmosis.poolmanager.v1beta1.MsgSplitRouteSwapExactAmountIn"].includes(
      message["@type"]
    )
  ) {
    const denomIn = message.token_in_denom as string
    const amountIn = _.reduce(
      message.routes,
      (p, c) => p.plus(c.token_in_amount),
      new BigNumber(0)
    )
      .shiftedBy(-assets[denomIn].decimal)
      .toNumber()

    const denomOut = _.last(_.first(message.routes as any[]).pools as any[])
      .token_out_denom as string
    const minAmountOut = new BigNumber(message.token_out_min_amount)
      .shiftedBy(-assets[denomOut].decimal)
      .toNumber()

    return {
      type: "Split Swap",
      amountIn: amountIn,
      assetIn: assets[denomIn],
      minAmountOut: minAmountOut,
      assetOut: assets[denomOut],
    } as const
  }

  if (
    "/osmosis.concentratedliquidity.v1beta1.MsgCreatePosition" ===
    message["@type"]
  ) {
    return {
      type: "CLMM",
      action: "Create CLMM Position",
    } as const
  }

  if (
    "/osmosis.concentratedliquidity.v1beta1.MsgAddToPosition" ===
    message["@type"]
  ) {
    return {
      type: "CLMM",
      action: "Add to CLMM Position",
    } as const
  }

  if ("/ibc.core.channel.v1.MsgRecvPacket" === message["@type"]) {
    return {
      type: "IBC",
      action: "Receive IBC Packet",
    } as const
  }

  return {
    type: "Unknown",
    action: _.last(message["@type"].split(".")),
  } as const
}
