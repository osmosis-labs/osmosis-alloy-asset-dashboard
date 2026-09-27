import "@/styles/globals.css"

import type { Metadata, Viewport } from "next"
import { GeistMono } from "geist/font/mono"
import { GeistSans } from "geist/font/sans"
import NextTopLoader from "nextjs-toploader"

import { siteConfig } from "@/config/site"
import { cn } from "@/lib/utils"
import { Toaster } from "@/components/ui/sonner"
import { AutoRefresh } from "@/components/auto-refresh"
import { Footer } from "@/components/footer"
import { Nav } from "@/components/nav"
import { ThemeProvider } from "@/components/theme-provider"

interface RootLayoutProps {
  children: React.ReactNode
}

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url.base),
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  keywords: siteConfig.keywords,
  authors: [
    {
      name: siteConfig.author,
      url: siteConfig.url.author,
    },
    {
      name: siteConfig.maintainer,
      url: siteConfig.url.maintainer,
    },
  ],
  creator: siteConfig.author,
  publisher: siteConfig.maintainer,
  openGraph: {
    type: "website",
    locale: "en_US",
    url: siteConfig.url.base,
    title: siteConfig.name,
    description: siteConfig.description,
    siteName: siteConfig.name,
    // Images come from the opengraph-image routes (site-wide and per pool).
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.name,
    description: siteConfig.description,
    creator: "@osmosiszone",
  },
  // The icon is src/app/icon.svg.
}

export const viewport: Viewport = {
  // The page backgrounds (--background in globals.css).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body
        className={cn(
          "min-h-screen bg-background antialiased",
          GeistMono.variable,
          GeistSans.className
        )}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Toaster closeButton />
          <AutoRefresh />
          <NextTopLoader
            color="hsl(var(--primary))"
            height={2}
            showSpinner={false}
          />

          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:ring-2 focus:ring-ring"
          >
            Skip to content
          </a>
          <div className="flex min-h-[100dvh] flex-col">
            <Nav />
            {/* The skip link's target; each page renders its own <main>. */}
            <div id="main" tabIndex={-1} className="flex flex-1 flex-col">
              {children}
            </div>
            <Footer />
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}
