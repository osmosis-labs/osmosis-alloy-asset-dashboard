import { clsx, type ClassValue } from "clsx"
import _ from "lodash"
import { twMerge } from "tailwind-merge"

import { Asset } from "@/types/asset"

export const getAssetImageUrl = (asset: Asset) => {
  return asset.images[0]?.svg || asset.images[0]?.png
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const camelizeKeys = (obj: any): any => {
  if (_.isArray(obj)) {
    return obj.map((v) => camelizeKeys(v))
  } else if (_.isPlainObject(obj)) {
    return Object.keys(obj).reduce(
      (result, key) => ({
        ...result,
        [_.camelCase(key)]: camelizeKeys(obj[key]),
      }),
      {}
    )
  }
  return obj
}

export const capitalName = (name: string) => {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()
}

export const percentColorCn = (value?: number) => {
  if (!value || value === 1) {
    return "text-muted-foreground"
  } else if (value > 1) {
    return "text-green-400"
  } else {
    return "text-red-400"
  }
}
