import { Skeleton } from "@/components/ui/skeleton";

export function GeneralSearchResultsSkeleton() {
  return (
    <div
      className="glass-wrapper space-y-4 p-4 sm:p-6"
      role="status"
      aria-label="Loading search results"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-52" />
        </div>
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-10 w-28 rounded-xl" />
          <Skeleton className="h-10 w-32 rounded-xl" />
        </div>
      </div>
      <div className="rounded-lg border border-border/60">
        <div className="grid grid-cols-[64px_112px_repeat(3,minmax(0,1fr))] gap-3 border-b border-border/60 bg-muted/35 px-3 py-3">
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-16" />
        </div>
        <div className="space-y-0">
          {Array.from({ length: 6 }, (_, index) => (
            <div
              key={`general-search-results-skeleton-${index}`}
              className="grid grid-cols-[64px_112px_repeat(3,minmax(0,1fr))] gap-3 border-b border-border/50 px-3 py-3 last:border-b-0"
            >
              <Skeleton className="h-4 w-6" />
              <Skeleton className="h-8 w-20 rounded-xl" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ))}
        </div>
      </div>
      <span className="sr-only">Loading search result rows</span>
    </div>
  );
}
