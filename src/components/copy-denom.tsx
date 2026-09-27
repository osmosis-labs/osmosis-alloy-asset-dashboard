"use client"

import { Copy } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { badgeVariants } from "@/components/ui/badge"

// A button showing the start of a denom; copies the whole denom.
const CopyDenom = ({ denom }: { denom: string }) => (
  <button
    type="button"
    className={cn(badgeVariants({ variant: "secondary" }), "min-h-6")}
    aria-label={`Copy denom ${denom}`}
    title={denom}
    onClick={() => {
      navigator.clipboard
        .writeText(denom)
        .then(() => toast.success("Copied denom to clipboard"))
        .catch((e) =>
          toast.error("Failed to copy to clipboard", { description: e.message })
        )
    }}
  >
    {denom.slice(0, 12)}... <Copy className="ml-1 size-3" aria-hidden />
  </button>
)
CopyDenom.displayName = "CopyDenom"

export { CopyDenom }
