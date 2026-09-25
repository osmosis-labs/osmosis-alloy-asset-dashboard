// External link targets. Celatone is kept for contract detail only;
// transactions and accounts open on Mintscan, pools and assets on the Osmosis
// app.
export const BlockExplorer = {
  BASE_URL: "https://celatone.osmosis.zone",
  CHAIN_ID: "osmosis-1",
  MINTSCAN_URL: "https://www.mintscan.io/osmosis",
  contract: (contractAddress: string) =>
    `${BlockExplorer.BASE_URL}/${BlockExplorer.CHAIN_ID}/contracts/${contractAddress}`,
  account: (accountAddress: string) =>
    `${BlockExplorer.MINTSCAN_URL}/address/${accountAddress}`,
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
