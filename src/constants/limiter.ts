export const LIMITERS = {
  static: {
    title: "Maximum share",
    description:
      "The largest share of the pool this variant may make up. Deposits or swaps that would push it past the limit are rejected, so the alloyed asset never depends too heavily on one bridge or issuer.",
  },
  change: {
    title: "Change limit",
    description:
      "Determines the maximum percentage of an asset permitted to enter the pools based on the moving average of the asset’s relative weighting over a specified period.",
  },
}
