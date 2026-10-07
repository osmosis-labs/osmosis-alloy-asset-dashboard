import "@/styles/globals.css"
import "@fontsource-variable/geist"
import "@fontsource-variable/geist-mono"

import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "react-router"

import { siteConfig } from "@/config/site"
import { cn } from "@/lib/utils"
import { Toaster } from "@/components/ui/sonner"
import { AutoRefresh } from "@/components/auto-refresh"
import { Footer } from "@/components/footer"
import { Nav } from "@/components/nav"
import { NotFoundPage } from "@/components/not-found-page"
import { ThemeProvider } from "@/components/theme-provider"
import { TopLoader } from "@/components/top-loader"

import { pageMeta } from "./meta"
import type { Route } from "./+types/root"

export const meta: Route.MetaFunction = () =>
  pageMeta({ description: siteConfig.description })

export const links: Route.LinksFunction = () => [
  { rel: "icon", href: "/icon.svg", type: "image/svg+xml" },
]

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: light)"
          content="#ffffff"
        />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: dark)"
          content="#0a0a0a"
        />
        <Meta />
        <Links />
      </head>
      <body className={cn("min-h-screen bg-background font-sans antialiased")}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Toaster closeButton />
          <AutoRefresh />
          <TopLoader />
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:ring-2 focus:ring-ring"
          >
            Skip to content
          </a>
          <div className="flex min-h-[100dvh] flex-col">
            <Nav />
            <div id="main" tabIndex={-1} className="flex flex-1 flex-col">
              {children}
            </div>
            <Footer />
          </div>
        </ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  )
}

export default function App() {
  return <Outlet />
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return <NotFoundPage />
  }

  return (
    <main className="container flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="max-w-md text-muted-foreground">
        The page could not be loaded. Refresh to try again.
      </p>
    </main>
  )
}
