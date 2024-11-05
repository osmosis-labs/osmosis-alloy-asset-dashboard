"use client"

import { Copy } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"

const CopyDenom = ({ denom }: { denom: string }) => (
  <Badge
    variant="secondary"
    className="cursor-pointer"
    onClick={() => {
      navigator.clipboard
        .writeText(denom)
        .then(() => toast.success("Copied denom to clipboard"))
        .catch((e) =>
          toast.error("Failed to copy to clipboard", { description: e.message })
        )
    }}
  >
    {denom.slice(0, 12)}... <Copy className="ml-1 size-3" />
  </Badge>
)
CopyDenom.displayName = "CopyDenom"

export { CopyDenom }
