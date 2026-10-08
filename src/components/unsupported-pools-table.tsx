import { useMemo } from "react"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import { Copy, EllipsisVertical, ExternalLink } from "lucide-react"
import { toast } from "sonner"

import { NotSupportedPoolOverview } from "@/types/pool"
import { BlockExplorer, OsmosisApp } from "@/lib/block-explorer"
import { capitalName } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
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

const UnsupportedPoolsTable = ({
  pools,
}: {
  pools: NotSupportedPoolOverview[]
}) => {
  const columns: ColumnDef<NotSupportedPoolOverview>[] = useMemo(
    () => [
      {
        header: "Pool Id",
        accessorKey: "id",
      },
      {
        header: "Assets",
        accessorKey: "reserveCoins",
        cell: (cell) => {
          const assets =
            cell.getValue() as NotSupportedPoolOverview["reserveCoins"]

          return (
            <div className="flex items-center gap-2">
              {assets?.map((asset) => {
                return (
                  <div
                    className="flex items-center gap-1 font-mono"
                    key={asset.currency.currency.coinMinimalDenom}
                  >
                    <Avatar className="size-5">
                      <AvatarImage
                        src={asset.currency.currency.coinImageUrl}
                        alt={asset.currency.currency.coinDenom}
                      />
                      <AvatarFallback>
                        {capitalName(asset.currency.currency.coinDenom)}
                      </AvatarFallback>
                    </Avatar>
                    <span>{asset.currency.currency.coinDenom}</span>
                  </div>
                )
              })}
            </div>
          )
        },
      },
      {
        // The pool actions menu, without the details link: these pools have
        // no page on the dashboard.
        id: "options",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon-xs"
                  variant="outline"
                  aria-label={`Pool ${row.original.id} actions`}
                >
                  <EllipsisVertical className="size-3" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-52" align="end">
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
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => {
                      window.open(OsmosisApp.pool(row.original.id), "_blank")
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
        ),
        size: 40,
      },
    ],
    []
  )

  const table = useReactTable({
    columns,
    data: pools,
    getCoreRowModel: getCoreRowModel(),
  })

  return (
    <Table>
      <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
          <TableRow key={headerGroup.id}>
            {headerGroup.headers.map((header) => {
              return (
                <TableHead key={header.id}>
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
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
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
  )
}
UnsupportedPoolsTable.displayName = "UnsupportedPoolsTable"

export { UnsupportedPoolsTable }
