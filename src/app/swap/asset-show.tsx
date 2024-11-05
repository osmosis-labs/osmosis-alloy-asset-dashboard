import BigNumber from "bignumber.js"
import _ from "lodash"
import { ChevronDown } from "lucide-react"

import { AssetWithDecimal, Coin } from "@/types/asset"
import { MinimalAssetPool } from "@/types/pool"
import { capitalName } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

const AssetShow = ({
  balance,
  asset,
  onAssetChange,
  open,
  onOpenChange,
  disabledDenoms = [],
  pools,
}: {
  balance?: _.Dictionary<Coin>
  asset: AssetWithDecimal
  onAssetChange: (asset: AssetWithDecimal, pool: MinimalAssetPool) => void
  open: boolean
  onOpenChange: (open: boolean) => void
  disabledDenoms?: string[]
  pools: MinimalAssetPool[]
}) => {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <div className="flex cursor-pointer items-center gap-2">
          <Avatar className="size-8 md:size-10">
            <AvatarImage src={asset.images[0].svg} alt={asset.symbol} />
            <AvatarFallback>{capitalName(asset.name)}</AvatarFallback>
          </Avatar>
          <div className="max-w-1/2 truncate">
            <h1 className="inline-flex items-center font-mono font-semibold md:text-lg">
              {asset.symbol}{" "}
              <ChevronDown className="ml-2 size-4 text-muted-foreground" />
            </h1>
            <p className="text-xs text-muted-foreground md:text-sm">
              {asset.name}
            </p>
          </div>
        </div>
      </PopoverTrigger>
      <PopoverContent className="w-[350px] p-0">
        <Command>
          <CommandInput placeholder="Search asset" />
          <CommandEmpty>No asset found.</CommandEmpty>
          <CommandList>
            {_.chain(pools)
              .map((pool) => {
                const alloyPrice = Number(pool.alloy.price)
                return (
                  <CommandGroup
                    key={pool.id}
                    heading={`Pool ${pool.alloy.asset.name}`}
                  >
                    {_.chain(pool.assets)
                      .concat([pool.alloy.asset])
                      .reverse()
                      .map((a) => {
                        const b = balance?.[a.denom]?.amount
                          ? new BigNumber(balance[a.denom].amount).shiftedBy(
                              -a.decimal
                            )
                          : null
                        const total = b ? b.multipliedBy(alloyPrice) : null
                        return (
                          <CommandItem
                            key={a.denom}
                            value={a.denom}
                            keywords={[a.symbol, a.name, a.denom]}
                            disabled={
                              a.denom === asset.denom ||
                              disabledDenoms.includes(a.denom)
                            }
                            className="data-[disabled='true']:hidden"
                            onSelect={() => {
                              onAssetChange(a, pool)
                              onOpenChange(false)
                            }}
                          >
                            <Avatar className="mr-2 size-6">
                              <AvatarImage src={a.images[0].svg} />
                            </Avatar>
                            <div>
                              <p className="truncate font-mono text-sm font-semibold">
                                {a.symbol || a.symbol || a.denom}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {a.name}
                              </p>
                            </div>
                            {b && (
                              <div className="ml-auto text-end">
                                <p className="text-sm font-medium">
                                  {b.precision(4).toString()}
                                </p>
                                {total && (
                                  <p className="truncate text-xs text-muted-foreground">
                                    ≈{total.toFixed(2)}
                                  </p>
                                )}
                              </div>
                            )}
                          </CommandItem>
                        )
                      })
                      .value()}
                  </CommandGroup>
                )
              })
              .flatMap((v, i, a) =>
                a.length - 1 !== i ? [v, <CommandSeparator key={i} />] : v
              )
              .value()}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
AssetShow.displayName = "AssetShow"

export { AssetShow }
