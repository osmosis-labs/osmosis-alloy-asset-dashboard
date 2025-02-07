"use client"

import Link from "next/link"
import {
  Column,
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  ChevronRight,
  Copy,
  EllipsisVertical,
  ExternalLink,
} from "lucide-react"
import { toast } from "sonner"

import { PoolOverview } from "@/types/pool"
import { BlockExplorer } from "@/lib/block-explorer"
import { NumberFormatter } from "@/lib/number"
import { capitalName, getAssetImageUrl } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button, buttonVariants } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
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

import { valueFormatter } from "./pool-card"

const columns: ColumnDef<PoolOverview>[] = [
  {
    header: "Pool Id",
    accessorKey: "id",
  },
  {
    id: "name",
    header: "Name",
    accessorKey: "alloy",
    cell: (row) => {
      const alloy = row.getValue() as PoolOverview["alloy"]
      return (
        <div className="flex items-center gap-2">
          <Avatar className="size-5">
            <AvatarImage
              src={getAssetImageUrl(alloy.asset)}
              alt={alloy.asset.symbol}
            />
            <AvatarFallback>{capitalName(alloy.asset.name)}</AvatarFallback>
          </Avatar>
          <h3 className="font-semibold">{alloy.asset.name}</h3>
        </div>
      )
    },
  },
  {
    header: "Assets",
    accessorKey: "reserveCoins",
    cell: (row) => {
      const assets = row.getValue() as PoolOverview["reserveCoins"]
      return (
        <div className="flex items-center gap-2">
          {assets?.map((asset) => {
            const Image = (
              <Avatar className="size-5">
                <AvatarImage
                  src={getAssetImageUrl(asset.asset)}
                  alt={asset.asset.symbol}
                />
                <AvatarFallback>{capitalName(asset.asset.name)}</AvatarFallback>
              </Avatar>
            )
            return (
              <Tooltip key={asset.asset.denom}>
                <TooltipTrigger asChild>{Image}</TooltipTrigger>
                <TooltipContent className="flex items-center gap-2 font-mono">
                  {Image} {asset.asset.symbol}
                </TooltipContent>
              </Tooltip>
            )
          })}
        </div>
      )
    },
  },
  {
    id: "price",
    header: "Price ($)",
    accessorKey: "alloy",
    cell: (row) => {
      const alloy = row.getValue() as PoolOverview["alloy"]
      return (
        <h3>
          {alloy.price?.amount
            ? NumberFormatter.formatValue(alloy.price?.amount)
            : "-"}
        </h3>
      )
    },
  },
  {
    header: "Market Cap ($)",
    accessorFn: (row) => ({
      price: row.alloy.price?.amount,
      totalAmount:
        row.reserveCoins?.reduce(
          (acc, a) => acc + valueFormatter(a.currency),
          0
        ) || 0,
    }),
    cell: (row) => {
      const { price, totalAmount } = row.getValue() as {
        price?: string
        totalAmount: number
      }
      return (
        <h3>
          {price
            ? NumberFormatter.formatValue(Number(price) * totalAmount)
            : "-"}
        </h3>
      )
    },
  },

  {
    id: "options",
    cell: ({ row }) => {
      return (
        <div className="flex gap-1">
          <Link
            className={buttonVariants({
              size: "icon-xs",
            })}
            href={`/pools/${row.original.id}`}
          >
            <ChevronRight className="size-4" />
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-xs" variant="outline">
                <EllipsisVertical className="size-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-52">
              <DropdownMenuItem>
                <ChevronRight className="mr-2 size-4" />
                <span>Go To Pool</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => {
                    navigator.clipboard
                      .writeText(row.original.contractAddress)
                      .then(() => toast.success("Copied Pool Address"))
                  }}
                >
                  <Copy className="mr-2 size-4" />
                  <span>Copy Pool Address</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    navigator.clipboard
                      .writeText(row.original.alloy.asset.denom)
                      .then(() => toast.success("Copied Pool Address"))
                  }}
                >
                  <Copy className="mr-2 size-4" />
                  <span>Copy Pool Denom</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => {
                    window.open(BlockExplorer.pool(row.original.id), "_blank")
                  }}
                >
                  <ExternalLink className="mr-2 size-4" />
                  <span>View Pool</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => {
                    window.open(
                      BlockExplorer.contract(row.original.contractAddress),
                      "_blank"
                    )
                  }}
                >
                  <ExternalLink className="mr-2 size-4" />
                  <span>View Contract</span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )
    },
    size: 40,
  },
]

function getCommonPinningStyles<TData>({
  column,
}: {
  column: Column<TData>
}): React.CSSProperties {
  const isPinned = column.getIsPinned()
  const isLastLeftPinnedColumn =
    isPinned === "left" && column.getIsLastColumn("left")
  const isFirstRightPinnedColumn =
    isPinned === "right" && column.getIsFirstColumn("right")

  return {
    boxShadow: isLastLeftPinnedColumn
      ? "-5px 0 5px -5px hsl(var(--border)) inset"
      : isFirstRightPinnedColumn
        ? "5px 0 5px -5px hsl(var(--border)) inset"
        : undefined,
    left: isPinned === "left" ? `${column.getStart("left")}px` : undefined,
    right: isPinned === "right" ? `${column.getAfter("right")}px` : undefined,
    opacity: isPinned ? 0.95 : 1,
    position: isPinned ? "sticky" : "relative",
    background: isPinned ? "hsl(var(--background))" : undefined,
    width: column.getSize(),
    zIndex: isPinned ? 1 : 0,
  }
}

const SupportedPoolsTable = ({ pools }: { pools: PoolOverview[] }) => {
  const table = useReactTable({
    columns,
    data: pools,
    getCoreRowModel: getCoreRowModel(),
    state: {
      columnPinning: {
        right: ["pool", "options"],
      },
    },
  })

  return (
    <TooltipProvider delayDuration={200}>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead
                    key={header.id}
                    style={{
                      ...getCommonPinningStyles({ column: header.column }),
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                )
              })}
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
                {row.getVisibleCells().map((cell) => {
                  return (
                    <TableCell
                      key={cell.id}
                      style={{
                        ...getCommonPinningStyles({ column: cell.column }),
                      }}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </TooltipProvider>
  )
}
SupportedPoolsTable.displayName = "SupportedPoolsTable"

export { SupportedPoolsTable }
