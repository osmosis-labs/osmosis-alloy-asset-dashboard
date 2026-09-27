import Link from "next/link"

import { siteConfig } from "@/config/site"

const FOOTER_LINKS = [
  { href: siteConfig.links.app, label: "Osmosis app" },
  { href: siteConfig.links.docs, label: "About alloyed assets" },
  { href: siteConfig.links.github, label: "Source" },
]

const Footer = () => (
  <footer className="border-t">
    <div className="container flex flex-col gap-3 py-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
      <div className="space-y-1">
        <p>
          Maintained by{" "}
          <Link
            href={siteConfig.url.maintainer}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {siteConfig.maintainer}
          </Link>
          . Originally built by{" "}
          <Link
            href={siteConfig.url.author}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {siteConfig.author}
          </Link>
          .
        </p>
        <p>Pool data refreshes every few minutes; swap activity every 15.</p>
      </div>
      <nav aria-label="Footer">
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {FOOTER_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                {link.label}
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
