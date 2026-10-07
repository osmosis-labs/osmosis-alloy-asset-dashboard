// The fields cosmos-kit hands to a wallet's suggestChain call for
// useChain("osmosis"). Fee steps and the CosmWasm feature flag come from the
// Osmosis chain-registry entry. The asset list is only OSMO: suggestChain
// uses the first asset as the stake currency and matches fee denoms against
// it. Swap balances and token metadata come from the pool data, not here.

const osmoLogo = {
  png: "https://raw.githubusercontent.com/cosmos/chain-registry/master/osmosis/images/osmo.png",
  svg: "https://raw.githubusercontent.com/cosmos/chain-registry/master/osmosis/images/osmo.svg",
}

export const osmosisChain = {
  chain_name: "osmosis",
  status: "live",
  network_type: "mainnet",
  pretty_name: "Osmosis",
  chain_type: "cosmos",
  chain_id: "osmosis-1",
  bech32_prefix: "osmo",
  slip44: 118,
  fees: {
    fee_tokens: [
      {
        denom: "uosmo",
        fixed_min_gas_price: 0.03,
        low_gas_price: 0.03,
        average_gas_price: 0.1,
        high_gas_price: 0.16,
      },
    ],
  },
  staking: {
    staking_tokens: [{ denom: "uosmo" }],
  },
  codebase: {
    sdk: { type: "cosmos", version: "0.50.14" },
    cosmwasm: { enabled: true, version: "0.53.3" },
  },
  apis: {
    rpc: [{ address: "https://rpc.osmosis.zone/" }],
    rest: [{ address: "https://lcd.osmosis.zone/" }],
  },
  logo_URIs: osmoLogo,
}

export const osmosisAssetList = {
  chain_name: "osmosis",
  assets: [
    {
      description: "The native token of Osmosis",
      denom_units: [
        { denom: "uosmo", exponent: 0 },
        { denom: "osmo", exponent: 6 },
      ],
      base: "uosmo",
      name: "Osmosis",
      display: "osmo",
      symbol: "OSMO",
      logo_URIs: osmoLogo,
      coingecko_id: "osmosis",
    },
  ],
}
