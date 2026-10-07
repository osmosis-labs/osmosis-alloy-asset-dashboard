// osmojs's package entry re-exports every generated proto bundle and does not
// set sideEffects: false, so `from "osmojs"` keeps cosmos, ibc, and tendermint.
// The swap signs two messages. These modules are those two files only.

import { AminoConverter as poolAmino } from "osmojs/esm/osmosis/poolmanager/v1beta1/tx.amino.js"
import {
  MessageComposer as PoolMessages,
  registry as poolRegistry,
} from "osmojs/esm/osmosis/poolmanager/v1beta1/tx.registry.js"
import { AminoConverter as wasmAmino } from "osmojs/esm/cosmwasm/wasm/v1/tx.amino.js"
import {
  MessageComposer as WasmMessages,
  registry as wasmRegistry,
} from "osmojs/esm/cosmwasm/wasm/v1/tx.registry.js"

export const swapExactAmountIn = PoolMessages.withTypeUrl.swapExactAmountIn
export const executeContract = WasmMessages.withTypeUrl.executeContract

export const swapProtoRegistry = [...poolRegistry, ...wasmRegistry]
export const swapAminoConverters = { ...poolAmino, ...wasmAmino }
