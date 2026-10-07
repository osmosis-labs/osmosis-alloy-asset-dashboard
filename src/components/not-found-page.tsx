import { Link } from "react-router"

import { buttonVariants } from "@/components/ui/button"

const NotFoundPage = () => (
  <main className="container flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
    <p className="text-sm font-semibold text-primary">404</p>
    <h1 className="text-2xl font-semibold">Page not found</h1>
    <p className="max-w-md text-muted-foreground">
      This page does not exist, or the pool is not one the dashboard lists.
      Pools under $10,000 of liquidity are listed on the pools page without a
      page of their own.
    </p>
    <div className="mt-2 flex flex-wrap justify-center gap-2">
      <Link to="/" className={buttonVariants()}>
        Overview
      </Link>
      <Link to="/pools" className={buttonVariants({ variant: "outline" })}>
        All pools
      </Link>
    </div>
  </main>
)
NotFoundPage.displayName = "NotFoundPage"

export { NotFoundPage }
