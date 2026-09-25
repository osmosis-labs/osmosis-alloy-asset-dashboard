export const BlockExplorer = {
  BASE_URL: "https://celatone.osmosis.zone",
  CHAIN_ID: "osmosis-1",
  MINTSCAN_URL: "https://www.mintscan.io/osmosis",
  pool: (poolId: string) =>
    `${BlockExplorer.BASE_URL}/${BlockExplorer.CHAIN_ID}/pools/${poolId}`,
  contract: (contractAddress: string) =>
    `${BlockExplorer.BASE_URL}/${BlockExplorer.CHAIN_ID}/contracts/${contractAddress}`,
  account: (accountAddress: string) =>
    `${BlockExplorer.BASE_URL}/${BlockExplorer.CHAIN_ID}/accounts/${accountAddress}`,
  // Celatone is kept for contract detail; transactions open on Mintscan.
  tx: (txHash: string) => `${BlockExplorer.MINTSCAN_URL}/tx/${txHash}`,
} as const
