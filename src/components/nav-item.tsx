"use client"

import { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { cn } from "@/lib/utils"

const NavItem = ({
  href,
  children,
  className,
  disabled,
}: {
  children: ReactNode
  href: string
  className?: string
  disabled?: boolean
}) => {
  const pathname = usePathname()

  return (
    <Link
      href={href}
      className={cn(
        "text-muted-foreground transition-colors hover:text-foreground",
        disabled && "cursor-not-allowed opacity-80",
        pathname === href && "text-foreground",
        className
      )}
    >
      {children}
    </Link>
  )
}
NavItem.displayName = "NavItem"

export { NavItem }
