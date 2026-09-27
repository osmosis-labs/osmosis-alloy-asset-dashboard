// User-facing copy for the pool / asset status badges. Onchain state is
// described from the transmuter contract's behaviour; assetlist reason codes
// are mapped to short labels here so the raw enum never leaks into the UI.

export const POOL_STATUS = {
  frozen: {
    title: "Pool Frozen",
    description:
      "Swaps, deposits and withdrawals through this pool are all paused, so its alloyed token cannot be redeemed for a variant until the pool is reactivated. The pool moderator or governance froze it by setting the contract inactive.",
  },
  unknown: {
    title: "Status Unknown",
    description:
      "The contract's active status could not be queried. The pool may or may not be frozen; check the contract directly before transacting.",
  },
  corrupted: {
    title: "Corrupted Asset",
    description:
      "The pool moderator has marked this constituent as corrupted. Its amount and weight in the pool can never increase: swaps into it are rejected, and it can only be taken out of the pool. Other assets can only be redeemed if this asset is redeemed alongside them in proportion.",
  },
  unstable: {
    title: "Unstable",
    description:
      "Flagged as unstable in the Osmosis assetlist. This is the same flag that drives the warning shown on app.osmosis.zone.",
  },
} as const

// `unstableReason` values written by the assetlist generator.
export const UNSTABLE_REASONS: Record<string, string> = {
  market: "Low market activity",
  manual: "Flagged manually",
  source_chain_killed: "Source chain has shut down",
  ibc_client: "IBC client expired",
}

// `depositHaltReason` / `withdrawalHaltReason` values written by the assetlist
// generator.
export const HALT_REASONS: Record<string, string> = {
  bridge_down: "Bridge down",
  extended_unstable_market: "Extended low market activity",
  source_chain_killed: "Source chain has shut down",
  manual: "Halted manually",
  planned_shutdown: "Planned shutdown",
}

// Falls back to a humanised form of the raw code so an unmapped new reason is
// still readable instead of being hidden.
export const reasonLabel = (
  table: Record<string, string>,
  reason: string | null | undefined
) => {
  if (!reason) return null
  return table[reason] ?? reason.replace(/_/g, " ")
}
