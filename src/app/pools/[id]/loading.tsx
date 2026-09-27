import { Skeleton } from "@/components/ui/skeleton"

// Shown while a pool page renders: the header, the four headline figures and
// the first charts, in the page's own layout.
export default function Loading() {
  return (
    <main className="container my-6 flex flex-col gap-6">
      <div role="status" className="flex flex-col gap-4 md:flex-row">
        <span className="sr-only">Loading pool</span>
        <Skeleton className="size-24 rounded-full" />
        <div className="flex flex-1 flex-col gap-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full max-w-xl" />
          <Skeleton className="h-4 w-2/3 max-w-md" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-10">
        <Skeleton className="h-[330px] md:col-span-7" />
        <Skeleton className="h-[330px] md:col-span-3" />
      </div>
    </main>
  )
}
