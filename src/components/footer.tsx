import Link from "next/link"
import { BookOpen, Github } from "lucide-react"

import { siteConfig } from "@/config/site"

const iconClass = "size-5"

// The Osmosis mark (the planet and its moon, from public/osmo-logo-icon.svg)
// as an outline in the current color, drawn like the lucide icons beside it.
const OsmosisOutline = ({ className }: { className?: string }) => (
  <svg
    viewBox="-1 -1 33 36"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinejoin="round"
    className={className}
    aria-hidden
  >
    <circle cx="14.6" cy="18.66" r="13.45" />
    <path d="M30.6156 5.86803C30.2788 4.56675 29.196 3.26549 27.2471 1.81688C25.6831 0.662916 24.0229 0 22.6996 0C22.4349 0 22.1944 0.0245463 21.9537 0.0736554C21.3522 0.19642 20.8229 0.638361 20.486 1.30128C20.077 2.08696 19.9808 3.14272 20.2454 3.78109C20.3417 3.97751 20.462 4.22301 20.6063 4.44398C19.3311 5.22968 18.6093 5.45065 18.5131 5.47522C21.8335 6.60459 24.6005 8.96168 26.3328 12.0307L26.3569 11.7361C26.429 10.9259 26.6696 9.99284 27.0065 9.03531C27.3433 9.13351 27.6802 9.18265 28.0171 9.18265C28.9073 9.18265 29.6773 8.81433 30.1585 8.15141C30.6397 7.48848 30.8322 6.60459 30.6156 5.86803Z" />
  </svg>
)

const FOOTER_LINKS = [
  {
    href: siteConfig.links.app,
    label: "Osmosis",
    icon: <OsmosisOutline className={iconClass} />,
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
    <div className="container flex justify-end py-4">
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
