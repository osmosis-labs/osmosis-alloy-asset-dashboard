"use client"

import { useMemo } from "react"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table"
import _ from "lodash"

import { AssetWithDecimal } from "@/types/asset"
import { NotSupportedPoolOverview } from "@/types/pool"
import { capitalName } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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
  assets,
}: {
  pools: NotSupportedPoolOverview[]
  assets: _.Dictionary<AssetWithDecimal>
}) => {
  const columns: ColumnDef<NotSupportedPoolOverview>[] = useMemo(
    () => [
      {
        header: "Pool Id",
        accessorKey: "id",
      },
      {
        header: "Assets",
        accessorKey: "coinDenoms",
        cell: (cell) => {
          const denoms =
            cell.getValue() as NotSupportedPoolOverview["coinDenoms"]
          const a = _.chain(denoms)
            .map((denom, i) => (i % 2 === 1 ? denom : null))
            .compact()
            .map((d) => (assets[d] || d) as AssetWithDecimal | string)
            .value()

          return (
            <div className="flex items-center gap-2">
              {a?.map((asset) => {
                if (typeof asset === "string") {
                  return (
                    <span className="font-mono" key={asset}>
                      {asset.slice(0, 6)}...
                    </span>
                  )
                }
                return (
                  <div
                    className="flex items-center gap-1 font-mono"
                    key={asset.denom}
                  >
                    <Avatar className="size-5">
                      <AvatarImage
                        src={asset.images[0].svg}
                        alt={asset.symbol}
                      />
                      <AvatarFallback>{capitalName(asset.name)}</AvatarFallback>
                    </Avatar>
                    <span>{asset.symbol}</span>
                  </div>
                )
              })}
            </div>
          )
        },
      },
    ],
    [assets]
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
