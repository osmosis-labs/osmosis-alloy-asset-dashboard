"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { TooltipArrow } from "@radix-ui/react-tooltip"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import BigNumber from "bignumber.js"
import _ from "lodash"
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  MoveRight,
  Settings2,
} from "lucide-react"

import { PoolOverview } from "@/types/pool"
import { PoolSwap } from "@/types/tx"
import { BlockExplorer } from "@/lib/block-explorer"
import dayjs from "@/lib/dayjs"
import { variantDenom, variantSymbol } from "@/lib/pool-sources"
import { cn, getAssetImageUrl } from "@/lib/utils"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { DecimalSpan } from "@/components/decimal-span"

type DenomMeta = { symbol: string; decimals: number; image?: string }

const AssetAmountWithTooltip = ({
  amount,
  denom,
  meta,
}: {
  amount: string
  denom: string
  meta?: DenomMeta
}) => {
  // Unknown denoms (not a reserve or the alloy) show the raw base amount.
  const value = meta
    ? new BigNumber(amount).shiftedBy(-meta.decimals).toNumber()
    : Number(amount)
  const label = meta?.symbol ?? `${denom.slice(0, 10)}..`
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1">
          <DecimalSpan mantissa={2} className="font-mono font-semibold">
            {value}
          </DecimalSpan>
          {meta?.image ? (
            <Avatar className="size-4">
              <AvatarImage src={meta.image} />
            </Avatar>
          ) : null}
          <span className="font-mono text-xs text-muted-foreground">
            {label}
          </span>
        </div>
      </TooltipTrigger>
      <TooltipContent className="font-mono">
        <TooltipArrow />
        <DecimalSpan mantissa={6}>{value}</DecimalSpan>{" "}
        <span className="text-muted-foreground">{label}</span>
      </TooltipContent>
    </Tooltip>
  )
}

const LIMITS = ["10", "20", "30"] as const
const TransactionTableContent = ({
  pool,
  swaps,
}: {
  pool: PoolOverview
  swaps: PoolSwap[]
}) => {
  const [limit, setLimit] = useState<(typeof LIMITS)[number]>("10")
  const [page, setPage] = useState(1)

  // Symbols and decimals for the pool's variants (frontend symbols) and the
  // alloy itself: the only denoms a swap through this pool can carry.
  const denomMeta = useMemo(() => {
    const meta: Record<string, DenomMeta> = {}
    for (const coin of pool.reserveCoins ?? []) {
      const denom = variantDenom(coin)
      if (!denom) continue
      meta[denom] = {
        symbol: variantSymbol(coin) ?? denom,
        decimals:
          coin.currency?.currency?.coinDecimals ?? coin.asset?.decimal ?? 6,
        image: coin.asset ? getAssetImageUrl(coin.asset) : undefined,
      }
    }
    if (pool.alloy.asset) {
      meta[pool.alloy.asset.base] = {
        symbol: pool.alloy.asset.display,
        decimals: pool.alloy.asset.decimal,
        image: getAssetImageUrl(pool.alloy.asset),
      }
    }
    return meta
  }, [pool])

  const columns: ColumnDef<PoolSwap>[] = useMemo(() => {
    return [
      {
        id: "hash",
        header: "Hash",
        accessorKey: "hash",
        cell: ({ getValue }) => {
          const hash = getValue() as string
          return (
            <Link
              href={BlockExplorer.tx(hash)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent-foreground hover:underline"
            >
              {hash.slice(0, 4)}..{hash.slice(-4)}
            </Link>
          )
        },
      },

      {
        id: "timestamp",
        header: "Timestamp",
        accessorKey: "timestamp",
        cell: ({ getValue }) => {
          const timestamp = dayjs.utc(getValue() as string)
          return (
            <div className="text-sm">
              <span className="font-medium">{timestamp.fromNow()}</span>
              <br />
              <span className="text-xs text-muted-foreground">
                {timestamp.local().format("YYYY/MM/DD HH:mm:ss")}
              </span>
            </div>
          )
        },
      },

      {
        id: "swap",
        header: "Swap",
        cell: ({ row }) => {
          const swap = row.original
          return (
            <div className="flex flex-wrap items-center justify-center gap-x-1">
              <AssetAmountWithTooltip
                amount={swap.in.amount}
                denom={swap.in.denom}
                meta={denomMeta[swap.in.denom]}
              />
              <MoveRight className="size-4" />
              <AssetAmountWithTooltip
                amount={swap.out.amount}
                denom={swap.out.denom}
                meta={denomMeta[swap.out.denom]}
              />
            </div>
          )
        },
      },

      {
        id: "action",
        header: "Action",
        accessorKey: "action",
        cell: ({ getValue }) => (
          <Badge size="sm" variant="outline">
            {getValue() as string}
          </Badge>
        ),
      },

      {
        id: "sender",
        header: "Sender",
        accessorKey: "sender",
        cell: ({ getValue }) => {
          const address = getValue() as string
          if (!address) return <span className="text-muted-foreground">-</span>
          return (
            <Link
              href={BlockExplorer.account(address)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-accent-foreground hover:underline"
            >
              {address.slice(0, 8)}..{address.slice(-4)}
            </Link>
          )
        },
      },
    ]
  }, [denomMeta])

  const totalPage = Math.max(Math.ceil(swaps.length / Number(limit)), 1)
  const pageRows = useMemo(
    () => swaps.slice((page - 1) * Number(limit), page * Number(limit)),
    [swaps, page, limit]
  )

  const [columnVisibility, setColumnVisibility] = useState<
    _.Dictionary<boolean>
  >({})
  const table = useReactTable({
    data: pageRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    state: {
      columnVisibility,
    },
    onColumnVisibilityChange: setColumnVisibility,
  })

  return (
    <TooltipProvider delayDuration={200}>
      <div className="w-full space-y-2">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Settings2 className="mr-2 size-4" />
                View
                <ChevronsUpDown className="ml-2 size-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuLabel>View</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {table.getAllLeafColumns().map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={column.getIsVisible()}
                  onCheckedChange={(v) => column.toggleVisibility(v)}
                  className="truncate"
                >
                  {_.startCase(column.id)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="ml-auto flex justify-end gap-2">
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={page === 1}
              onClick={() => setPage(1)}
            >
              <ChevronsLeft className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={page === 1}
              onClick={() => setPage((prev) => prev - 1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={page >= totalPage}
              onClick={() => setPage((prev) => prev + 1)}
            >
              <ChevronRight className="size-4" />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={page >= totalPage}
              onClick={() => setPage(totalPage)}
            >
              <ChevronsRight className="size-4" />
            </Button>
          </div>
        </div>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow key={hg.id}>
                  {hg.headers.map((h, i) => (
                    <TableHead
                      key={h.id}
                      className={cn(i !== 0 && "text-center")}
                    >
                      {h.isPlaceholder
                        ? null
                        : flexRender(h.column.columnDef.header, h.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext()
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={columns.length}
                    className="h-24 text-center"
                  >
                    No swaps in the last 24 hours.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center gap-2 text-sm font-medium">
          <div>{swaps.length.toLocaleString("en-US")} swaps</div>

          <div className="ml-4">Rows Per Page</div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {limit}{" "}
                <ChevronsUpDown className="ml-2 size-3 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-32">
              <DropdownMenuLabel>Rows Per Page</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={limit}
                onValueChange={(v) => {
                  setLimit(v as (typeof LIMITS)[number])
                  setPage(1)
                }}
              >
                {LIMITS.map((l) => (
                  <DropdownMenuRadioItem key={l} value={l}>
                    {l}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="ml-auto">
            Page {page} of {totalPage}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
TransactionTableContent.displayName = "TransactionTableContent"

export { TransactionTableContent }
