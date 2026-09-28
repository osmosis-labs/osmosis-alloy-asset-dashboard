import Link from "next/link"
import { BookOpen, Github } from "lucide-react"

import { siteConfig } from "@/config/site"

const iconClass = "size-5"

const FOOTER_LINKS = [
  {
    href: siteConfig.links.app,
    label: "Osmosis",
    icon: <img src="/osmo-logo-icon.svg" alt="" className={iconClass} />,
  },
  {
    href: siteConfig.links.docs,
    label: "Documentation",
    icon: <BookOpen className={iconClass} aria-hidden />,
  },
  {
    href: siteConfig.links.github,
    label: "GitHub",
    icon: <Github className={iconClass} aria-hidden />,
  },
]

const Footer = () => (
  <footer className="border-t">
    <div className="container flex flex-col gap-3 py-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
      <p>Pool data refreshes every few minutes; swap activity every 15.</p>
      <nav aria-label="Footer">
        <ul className="flex gap-2">
          {FOOTER_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-label={link.label}
                title={link.label}
                className="flex size-9 items-center justify-center rounded-md text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {link.icon}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  </footer>
)
Footer.displayName = "Footer"

export { Footer }
