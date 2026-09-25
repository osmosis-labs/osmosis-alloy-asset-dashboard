// External link targets. Celatone is kept for contract detail only;
// transactions and accounts open on Mintscan, pools and assets on the Osmosis
// app.
const MINTSCAN_CHAIN_BY_PREFIX: Record<string, string> = {
  osmo: "osmosis",
  inj: "injective",
  noble: "noble",
  cosmos: "cosmos",
  axelar: "axelar",
  neutron: "neutron",
  celestia: "celestia",
  stride: "stride",
  dydx: "dydx",
  akash: "akash",
  kava: "kava",
  juno: "juno",
  stars: "stargaze",
  secret: "secret",
  dym: "dymension",
  init: "initia",
  terra: "terra",
}

const CHAIN_NAME_BY_PREFIX: Record<string, string> = {
  osmo: "Osmosis",
  inj: "Injective",
  noble: "Noble",
  cosmos: "Cosmos Hub",
  axelar: "Axelar",
  neutron: "Neutron",
  celestia: "Celestia",
  stride: "Stride",
  dydx: "dYdX",
  akash: "Akash",
  kava: "Kava",
  juno: "Juno",
  stars: "Stargaze",
  secret: "Secret",
  dym: "Dymension",
  init: "Initia",
  terra: "Terra",
  nolus: "Nolus",
}

// Human chain name for a bech32 address, or its prefix when unknown.
export const chainNameForAddress = (address: string) => {
  const prefix = address.slice(0, address.lastIndexOf("1"))
  return CHAIN_NAME_BY_PREFIX[prefix] ?? prefix
}

export const BlockExplorer = {
  BASE_URL: "https://celatone.osmosis.zone",
  CHAIN_ID: "osmosis-1",
  MINTSCAN_URL: "https://www.mintscan.io/osmosis",
  contract: (contractAddress: string) =>
    `${BlockExplorer.BASE_URL}/${BlockExplorer.CHAIN_ID}/contracts/${contractAddress}`,
  // Accounts can be on other chains (an IBC-hooks swap is attributed to its
  // source-chain sender), so pick the Mintscan chain from the bech32 prefix.
  // Unknown prefixes return null and render as plain text.
  account: (accountAddress: string): string | null => {
    const prefix = accountAddress.slice(0, accountAddress.lastIndexOf("1"))
    const chain = MINTSCAN_CHAIN_BY_PREFIX[prefix]
    return chain
      ? `https://www.mintscan.io/${chain}/address/${accountAddress}`
      : null
  },
  tx: (txHash: string) => `${BlockExplorer.MINTSCAN_URL}/tx/${txHash}`,
} as const

export const OsmosisApp = {
  BASE_URL: "https://app.osmosis.zone",
  pool: (poolId: string) => `${OsmosisApp.BASE_URL}/pool/${poolId}`,
  // The app's asset page is keyed by minimal denom (it redirects other forms
  // to this one), so ibc/ and factory/ denoms are URL-encoded.
  asset: (coinMinimalDenom: string) =>
    `${OsmosisApp.BASE_URL}/assets/${encodeURIComponent(coinMinimalDenom)}`,
} as const
