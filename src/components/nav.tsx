import { Link } from "react-router"

import { siteConfig } from "@/config/site"

import { ModeToggle } from "./mode-toggle"
import { NavItem } from "./nav-item"

const Nav = () => {
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center gap-4 border-b bg-background md:space-x-4 md:px-2">
      <div className="container flex items-center gap-4 sm:gap-6">
        <div>
          <Link
            to="/"
            className="flex items-center gap-2 font-semibold md:text-lg"
          >
            <img src="/osmo-logo-icon.svg" className="size-5 shrink-0" alt="" />
            <div className="flex flex-col">
              <span>Osmosis</span>
              <span className="-mt-1 hidden text-xs font-medium sm:inline">
                Alloyed Assets
              </span>
            </div>
          </Link>
        </div>
        <nav aria-label="Main">
          <ul className="flex gap-4 text-sm font-medium">
            <li>
              <NavItem href="/">Overview</NavItem>
            </li>
            <li>
              <NavItem href="/pools">Pools</NavItem>
            </li>
            <li>
              <NavItem href="/swap">
                <span className="sm:hidden">Swap</span>
                <span className="hidden sm:inline">Transmuter Swap</span>
              </NavItem>
            </li>
            <li>
              <a
                href={siteConfig.links.docs}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <span className="sm:hidden">About</span>
                <span className="hidden sm:inline">About Alloyed Assets</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          </ul>
        </nav>
        <div className="ml-auto flex flex-1 items-center justify-end">
          <ModeToggle />
        </div>
      </div>
    </header>
  )
}
Nav.displayName = "Nav"

export { Nav }
