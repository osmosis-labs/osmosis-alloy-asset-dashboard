import { ReactNode } from "react"
import {
  appStatusMessages,
  HALT_REASONS,
  POOL_STATUS,
  reasonLabel,
  UNSTABLE_REASONS,
} from "@/constants/status"
import { TooltipArrow } from "@radix-ui/react-tooltip"
import _ from "lodash"
import { CircleHelp, ShieldAlert, Snowflake, TriangleAlert } from "lucide-react"

import { AssetStatus } from "@/types/asset"
import { PoolOverview, PoolStatus } from "@/types/pool"
import { variantSymbol } from "@/lib/pool-sources"
import { Badge, BadgeProps } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

type Size = BadgeProps["size"]

// Every badge carries its own provider so it renders identically whether the
// parent (server component card, client table) has one or not. The trigger is
// wrapped in a button: Badge does not forward refs, and Radix needs the ref to
// anchor the tooltip, and a button can take keyboard focus, so the
// explanation opens on focus as well as on hover.
const StatusTooltip = ({
  title,
  trigger,
  children,
}: {
  title: string
  trigger: ReactNode
  children: ReactNode
}) => (
  <TooltipProvider delayDuration={200}>
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {trigger}
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[350px] space-y-1 text-start">
        <TooltipArrow />
        <p className="font-semibold">{title}</p>
        {children}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
)

// True when the assetlist has anything to say about this denom.
const isFlagged = (status?: AssetStatus | null): status is AssetStatus =>
  !!status &&
  (status.unstable ||
    status.disabled ||
    status.haltDeposits ||
    status.haltWithdrawals ||
    !!status.tooltipMessage)

// Short badge label for an assetlist-flagged asset, most severe first.
const assetFlagLabel = (status: AssetStatus) => {
  if (status.haltDeposits && status.haltWithdrawals) return "Halted"
  if (status.haltDeposits) return "Deposits Halted"
  if (status.haltWithdrawals) return "Withdrawals Halted"
  if (status.disabled) return "Disabled"
  return "Unstable"
}

// The assetlist tooltip, worded as app.osmosis.zone words it: the free-text
// message written by the assetlist maintainers, or, when there is none (most
// low-activity assets), the app's sentence for each flag. With a maintainer
// message, the structured reason codes follow it, since the message may not
// name every flag.
const AssetStatusLines = ({ status }: { status: AssetStatus }) => {
  const unstable = reasonLabel(UNSTABLE_REASONS, status.unstableReason)
  const deposit = reasonLabel(HALT_REASONS, status.depositHaltReason)
  const withdrawal = reasonLabel(HALT_REASONS, status.withdrawalHaltReason)
  const since = status.lastDowntimeDate
    ? new Date(status.lastDowntimeDate).toISOString().slice(0, 10)
    : null

  return (
    <div className="space-y-1 text-xs">
      {appStatusMessages(status).map((message) => (
        <p key={message} className="whitespace-pre-wrap break-words">
          {message}
        </p>
      ))}
      <ul className="list-inside list-disc text-muted-foreground">
        {status.tooltipMessage && (
          <>
            {status.unstable && (
              <li>Unstable{unstable ? `: ${unstable}` : ""}</li>
            )}
            {status.haltDeposits && (
              <li>Deposits halted{deposit ? `: ${deposit}` : ""}</li>
            )}
            {status.haltWithdrawals && (
              <li>Withdrawals halted{withdrawal ? `: ${withdrawal}` : ""}</li>
            )}
            {status.disabled && <li>Disabled on app.osmosis.zone</li>}
          </>
        )}
        {since && <li>Flagged since {since}</li>}
      </ul>
      <p className="text-muted-foreground">Source: Osmosis assetlist</p>
    </div>
  )
}

// Pool-level badges: frozen / unknown (from the contract) and the alloyed
// denom's own assetlist flags, plus a count of corrupted constituents.
const PoolStatusBadges = ({
  pool,
  size = "sm",
}: {
  pool: Pick<PoolOverview, "status"> & {
    reserveCoins?: PoolOverview["reserveCoins"] | null
  }
  size?: Size
}) => {
  // `status` is absent on overviews built before this field existed (an old
  // runtime last-known-good entry). Unknown is reported as unknown.
  const status = pool.status ?? null
  const alloyStatus = status?.alloy ?? null
  const corrupted = status?.corruptedDenoms ?? []
  const symbolByDenom = _.chain(pool.reserveCoins ?? [])
    .keyBy((c) => c.asset?.base ?? c.currency.currency.coinMinimalDenom)
    .mapValues((c) => variantSymbol(c))
    .value()

  return (
    <>
      {status?.isActive === false && (
        <StatusTooltip
          title={POOL_STATUS.frozen.title}
          trigger={
            <Badge size={size} variant="destructive" className="gap-1">
              <Snowflake className="size-3" aria-hidden /> Frozen
            </Badge>
          }
        >
          <p className="text-xs">{POOL_STATUS.frozen.description}</p>
          {isFlagged(alloyStatus) && <AssetStatusLines status={alloyStatus} />}
        </StatusTooltip>
      )}
      {(status === null || status.isActive === null) && (
        <StatusTooltip
          title={POOL_STATUS.unknown.title}
          trigger={
            <Badge size={size} variant="outline" className="gap-1">
              <CircleHelp className="size-3" /> Status Unknown
            </Badge>
          }
        >
          <p className="text-xs">{POOL_STATUS.unknown.description}</p>
        </StatusTooltip>
      )}
      {status?.isActive !== false && isFlagged(alloyStatus) && (
        <StatusTooltip
          title={`${POOL_STATUS.unstable.title} (${assetFlagLabel(alloyStatus)})`}
          trigger={
            <Badge size={size} variant="warning" className="gap-1">
              <TriangleAlert className="size-3" /> {assetFlagLabel(alloyStatus)}
            </Badge>
          }
        >
          <AssetStatusLines status={alloyStatus} />
        </StatusTooltip>
      )}
      {corrupted.length > 0 && (
        <StatusTooltip
          title={POOL_STATUS.corrupted.title}
          trigger={
            <Badge size={size} variant="destructive" className="gap-1">
              <ShieldAlert className="size-3" /> {corrupted.length} Corrupted
            </Badge>
          }
        >
          <p className="text-xs">{POOL_STATUS.corrupted.description}</p>
          <ul className="list-inside list-disc font-mono text-xs">
            {corrupted.map((d) => (
              <li key={d}>{symbolByDenom[d] ?? d}</li>
            ))}
          </ul>
        </StatusTooltip>
      )}
    </>
  )
}
PoolStatusBadges.displayName = "PoolStatusBadges"

// Constituent-level badges: corrupted (from the contract) and the assetlist
// flags for that denom.
const AssetStatusBadges = ({
  status,
  corrupted = false,
  size = "xs",
}: {
  status?: AssetStatus | null
  corrupted?: boolean
  size?: Size
}) => (
  <>
    {corrupted && (
      <StatusTooltip
        title={POOL_STATUS.corrupted.title}
        trigger={
          <Badge size={size} variant="destructive" className="gap-1">
            <ShieldAlert className="size-3" /> Corrupted
          </Badge>
        }
      >
        <p className="text-xs">{POOL_STATUS.corrupted.description}</p>
      </StatusTooltip>
    )}
    {isFlagged(status) && (
      <StatusTooltip
        title={`${POOL_STATUS.unstable.title} (${assetFlagLabel(status)})`}
        trigger={
          <Badge size={size} variant="warning" className="gap-1">
            <TriangleAlert className="size-3" /> {assetFlagLabel(status)}
          </Badge>
        }
      >
        <AssetStatusLines status={status} />
      </StatusTooltip>
    )}
  </>
)
AssetStatusBadges.displayName = "AssetStatusBadges"

// Whole-tile tints so status is visible without reading the badges.
// Frozen pool: translucent icy blue. Corrupted constituent: translucent red.
// Constituent with halted deposits or withdrawals: translucent orange. An
// asset that is merely "unstable" (no halt) keeps the amber badge only.
// `frozen-tile` is the frosted-glass treatment defined in globals.css.
const FROZEN_TILE_CLASS = "frozen-tile"
const CORRUPTED_TILE_CLASS =
  "border-red-500/60 bg-red-500/15 dark:border-red-400/50 dark:bg-red-500/15"
const HALTED_TILE_CLASS =
  "border-orange-500/60 bg-orange-500/15 dark:border-orange-400/50 dark:bg-orange-500/15"

const isFrozen = (status?: PoolStatus | null) => status?.isActive === false

const poolTileClass = (status?: PoolStatus | null): string | undefined =>
  isFrozen(status) ? FROZEN_TILE_CLASS : undefined

const assetTileClass = (
  status?: AssetStatus | null,
  corrupted = false
): string | undefined => {
  if (corrupted) return CORRUPTED_TILE_CLASS
  if (status?.haltDeposits || status?.haltWithdrawals) return HALTED_TILE_CLASS
  return undefined
}

// Ring class for an avatar so a corrupted / flagged constituent stands out in
// compact lists where there is no room for a badge.
const assetRingClass = (
  status?: AssetStatus | null,
  corrupted = false
): string | undefined => {
  if (corrupted) return "ring-2 ring-destructive"
  if (isFlagged(status)) return "ring-2 ring-amber-500"
  return undefined
}

export {
  PoolStatusBadges,
  AssetStatusBadges,
  AssetStatusLines,
  assetRingClass,
  assetTileClass,
  isFlagged,
  isFrozen,
  poolTileClass,
}
