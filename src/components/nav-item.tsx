import { ReactNode } from "react"
import { Link, useLocation } from "react-router"

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
  const pathname = useLocation().pathname
  // Pool pages count as Pools; the overview only matches itself.
  const isCurrent =
    href === "/" ? pathname === "/" : (pathname?.startsWith(href) ?? false)

  return (
    <Link
      to={href}
      className={cn(
        "text-muted-foreground transition-colors hover:text-foreground",
        disabled && "cursor-not-allowed opacity-80",
        isCurrent && "text-foreground",
        className
      )}
      aria-current={isCurrent ? "page" : undefined}
    >
      {children}
    </Link>
  )
}
NavItem.displayName = "NavItem"

export { NavItem }
