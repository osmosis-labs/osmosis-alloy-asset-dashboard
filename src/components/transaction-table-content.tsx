"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { getTxsByPoolIdPagination, getTxsCountByPoolId } from "@/services/tx"
import { TooltipArrow } from "@radix-ui/react-tooltip"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import _, { head } from "lodash"
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUpDown,
  Loader2,
  MoveRight,
  RefreshCw,
  Settings2,
  X,
} from "lucide-react"
import useSWR, { useSWRConfig } from "swr"

import { Asset, AssetWithDecimal } from "@/types/asset"
import { PoolOverview } from "@/types/pool"
import { PoolTransaction } from "@/types/tx"
import { actionFormatter } from "@/lib/action-formatter"
import { BlockExplorer } from "@/lib/block-explorer"
import dayjs from "@/lib/dayjs"
import { cn } from "@/lib/utils"
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

const AssetAmountWithTooltip = ({
  amount,
  asset,
}: {
  amount: number
  asset: AssetWithDecimal
}) => {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1">
          <DecimalSpan mantissa={2} className="font-mono font-semibold">
            {amount}
          </DecimalSpan>
          <Avatar className="size-4">
            <AvatarImage src={asset.images[0].svg} />
          </Avatar>
        </div>
      </TooltipTrigger>
      <TooltipContent className="font-mono">
        <TooltipArrow />
        <DecimalSpan mantissa={4}>{amount}</DecimalSpan>{" "}
        <span className="text-muted-foreground">{asset.symbol}</span>
      </TooltipContent>
    </Tooltip>
  )
}

const LIMITS = ["10", "20", "30"] as const
const TransactionTableContent = ({
  pool,
  assets,
}: {
  pool: PoolOverview
  assets: _.Dictionary<AssetWithDecimal>
}) => {
  const [limit, setLimit] = useState<(typeof LIMITS)[number]>("10")
  const [page, setPage] = useState(1)

  const {
    data,
    error,
    isValidating: isLoading,
    mutate,
  } = useSWR(
    ["txs", pool.id, page, limit],
    async ([, id, page, limit]) =>
      getTxsByPoolIdPagination(id, page, Number(limit)),
    {
      keepPreviousData: true,
      refreshInterval: 60000,
      fallbackData: [],
    }
  )
  const {
    data: count,
    isValidating: isLoadingCount,
    mutate: mutateCount,
  } = useSWR(
    ["txs-count", pool.id],
    async ([, id]) => getTxsCountByPoolId(id),
    {
      keepPreviousData: true,
      refreshInterval: 60000,
      fallbackData: 0,
    }
  )

  const columns: ColumnDef<PoolTransaction>[] = useMemo(() => {
    return [
      {
        id: "status",
        header: "Status",
        accessorKey: "transaction.success",
        cell: ({ getValue }) => {
          const success = getValue() as boolean
          return success ? (
            <Check className="size-4 text-green-500" />
          ) : (
            <X className="size-4 text-red-500" />
          )
        },
      },

      {
        id: "hash",
        header: "Hash",
        accessorKey: "transaction.hash",
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
        accessorKey: "block.timestamp",
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
        id: "action",
        header: "Action",
        accessorKey: "transaction.messages",
        cell: ({ getValue }) => {
          const messages =
            getValue() as PoolTransaction["transaction"]["messages"]
          const action = actionFormatter(messages, assets)

          if (action.type === "Swap" || action.type === "Split Swap") {
            return (
              <div className="flex flex-wrap items-center justify-center gap-x-1">
                <Badge size="sm" variant="outline">
                  {action.type}
                </Badge>
                <AssetAmountWithTooltip
                  amount={action.amountIn}
                  asset={action.assetIn}
                />
                <MoveRight className="size-4" />
                <AssetAmountWithTooltip
                  amount={action.minAmountOut}
                  asset={action.assetOut}
                />
              </div>
            )
          }

          return <div className="font-medium italic">{action.action}</div>
        },
      },

      {
        id: "sender",
        header: "Sender",
        accessorKey: "transaction.account.address",
        cell: ({ getValue }) => {
          const address = getValue() as string
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
  }, [assets])

  const totalPage = useMemo(() => {
    return Math.ceil((count || 0) / Number(limit))
  }, [count, limit])

  const [columnVisibility, setColumnVisibility] = useState<
    _.Dictionary<boolean>
  >({})
  const table = useReactTable({
    data,
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
          <Button size="icon-sm" variant="outline">
            <RefreshCw
              className={cn(
                "size-4",
                (isLoading || isLoadingCount) && "animate-spin"
              )}
              onClick={() => {
                mutate()
                mutateCount()
              }}
            />
          </Button>
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
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                  >
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
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center gap-2 text-sm font-medium">
          <div>Total {count} Transactions</div>

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
                onValueChange={(v) => setLimit(v as (typeof LIMITS)[number])}
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
