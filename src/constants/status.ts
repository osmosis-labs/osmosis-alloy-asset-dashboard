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

// The sentences app.osmosis.zone shows for a flagged asset that has no
// maintainer-written tooltipMessage, by reason code, copied from the
// frontend's en.json ("unstable", "halt.deposit", "halt.withdrawal") and its
// reason-key mapping (utils/halt-reasons.ts), so an asset reads the same here
// as in the app. Unmapped codes use `unknown`, as the app does.
export const APP_STATUS_MESSAGES = {
  unstable: {
    ibc_client: "IBC client to this asset's chain has been unstable.",
    source_chain_killed: "Source chain for this asset has ceased operation.",
    market:
      "This asset has had very low liquidity and trading volume for an extended period.",
    manual: "Unstable, exercise caution.",
    unknown: "Unstable, exercise caution.",
  },
  deposit: {
    bridge_down: "Deposits halted. Native bridge route is down.",
    extended_unstable_market:
      "Deposits halted. Asset has been unstable and inactive for an extended period.",
    planned_shutdown: "Deposits halted. Asset is scheduled for shutdown.",
    source_chain_killed: "Deposits halted. Source chain has ceased operation.",
    manual: "Deposits halted, exercise caution.",
    unknown: "Deposits halted.",
  },
  withdrawal: {
    bridge_down: "Withdrawals halted. Native bridge route is down.",
    source_chain_killed:
      "Withdrawals halted. Source chain has ceased operation.",
    manual: "Withdrawals halted, exercise caution.",
    unknown: "Withdrawals halted.",
  },
} as const

const appMessage = (
  table: Record<string, string> & { unknown: string },
  reason: string | null | undefined
) => (reason && reason in table ? table[reason] : table.unknown)

// What app.osmosis.zone says about a flagged asset: the assetlist
// maintainers' tooltipMessage when there is one, otherwise one sentence per
// flag from the reason codes. A disabled asset is hidden in the app rather
// than explained, so it gets a line of its own here.
export const appStatusMessages = (status: {
  unstable: boolean
  unstableReason: string | null
  disabled: boolean
  haltDeposits: boolean
  haltWithdrawals: boolean
  depositHaltReason: string | null
  withdrawalHaltReason: string | null
  tooltipMessage: string | null
}): string[] => {
  if (status.tooltipMessage) return [status.tooltipMessage]
  const messages: string[] = []
  if (status.unstable) {
    messages.push(
      appMessage(APP_STATUS_MESSAGES.unstable, status.unstableReason)
    )
  }
  if (status.haltDeposits) {
    messages.push(
      appMessage(APP_STATUS_MESSAGES.deposit, status.depositHaltReason)
    )
  }
  if (status.haltWithdrawals) {
    messages.push(
      appMessage(APP_STATUS_MESSAGES.withdrawal, status.withdrawalHaltReason)
    )
  }
  if (status.disabled) {
    messages.push("Disabled: this asset is hidden on app.osmosis.zone.")
  }
  return messages
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
