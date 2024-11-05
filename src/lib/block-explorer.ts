export const BlockExplorer = {
  BASE_URL: "https://celatone.osmosis.zone",
  CHAIN_ID: "osmosis-1",
  pool: (poolId: string) =>
    `${BlockExplorer.BASE_URL}/${BlockExplorer.CHAIN_ID}/pools/${poolId}`,
  contract: (contractAddress: string) =>
    `${BlockExplorer.BASE_URL}/${BlockExplorer.CHAIN_ID}/contracts/${contractAddress}`,
  account: (accountAddress: string) =>
    `${BlockExplorer.BASE_URL}/${BlockExplorer.CHAIN_ID}/accounts/${accountAddress}`,
  tx: (txHash: string) =>
    `${BlockExplorer.BASE_URL}/${BlockExplorer.CHAIN_ID}/txs/${txHash}`,
} as const
