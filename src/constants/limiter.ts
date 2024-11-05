export const LIMITERS = {
  static: {
    title: "Static Limiter",
    description:
      "Determines the maximum percentage of the pool allowed to be a specific asset, preventing extreme imbalance from occurring and minimizing the exposure of the Alloyed Asset to a particular constituent.",
  },
  change: {
    title: "Change Limiter",
    description:
      "Determines the maximum percentage of an asset permitted to enter the pools based on the moving average of the asset’s relative weighting over a specified period.",
  },
}
