// Deep imports of osmojs message files. The package only ships types for its
// barrel, and that barrel pulls every proto bundle into the Worker.

type OsmoAminoConverter = {
  readonly aminoType: string
  readonly toAmino: (value: unknown) => unknown
  readonly fromAmino: (value: unknown) => unknown
}

declare module "osmojs/esm/osmosis/poolmanager/v1beta1/tx.registry.js" {
  export const registry: [string, unknown][]
  export const MessageComposer: {
    withTypeUrl: {
      swapExactAmountIn: (value: {
        sender: string
        routes: { poolId: bigint; tokenOutDenom: string }[]
        tokenIn: { denom: string; amount: string }
        tokenOutMinAmount: string
      }) => { typeUrl: string; value: unknown }
    }
  }
}

declare module "osmojs/esm/osmosis/poolmanager/v1beta1/tx.amino.js" {
  export const AminoConverter: Record<string, OsmoAminoConverter>
}

declare module "osmojs/esm/cosmwasm/wasm/v1/tx.registry.js" {
  export const registry: [string, unknown][]
  export const MessageComposer: {
    withTypeUrl: {
      executeContract: (value: {
        sender: string
        contract: string
        msg: Uint8Array
        funds: { denom: string; amount: string }[]
      }) => { typeUrl: string; value: unknown }
    }
  }
}

declare module "osmojs/esm/cosmwasm/wasm/v1/tx.amino.js" {
  export const AminoConverter: Record<string, OsmoAminoConverter>
}
