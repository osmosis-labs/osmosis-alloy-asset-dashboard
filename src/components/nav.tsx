import Link from "next/link"

import { ModeToggle } from "./mode-toggle"
import { NavItem } from "./nav-item"

const Nav = () => {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background md:space-x-4 md:px-2">
      <div className="container flex items-center gap-6">
        <div>
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold md:text-lg"
          >
            <img
              src="/osmo-logo-icon.svg"
              className="size-5 shrink-0"
              alt="osmosis"
            />
            <div className="flex flex-col">
              <span>Osmosis</span>
              <span className="-mt-1 text-xs font-medium">
                Alloy Asset Dashboard
              </span>
            </div>
          </Link>
        </div>
        <div className="flex gap-4 font-mono text-sm font-medium">
          <NavItem href="/">Overview</NavItem>
          <NavItem href="/pools">Pools</NavItem>
          <NavItem href="/swap">Swap</NavItem>
        </div>
        <div className="ml-auto flex flex-1 items-center justify-end space-x-4">
          <nav className="flex items-center space-x-1">
            <ModeToggle />
          </nav>
        </div>
      </div>
    </header>
  )
}
Nav.displayName = "Nav"

export { Nav }
