import { Skeleton } from "@/components/ui/skeleton";

export function SavedLoadingSkeleton() {
  return (
    <div className="space-y-4" data-testid="saved-loading-skeleton">
      <div className="rounded-xl border border-border/70 bg-background/80 p-4 shadow-sm">
        <div className="flex flex-wrap gap-3">
          <Skeleton className="h-9 w-full max-w-sm" />
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-background/80 p-4 shadow-sm">
        <div className="space-y-3">
          <Skeleton className="h-6 w-40" />
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={`saved-skeleton-row-${index}`}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border/60 bg-background/70 p-4"
            >
              <div className="flex min-w-0 flex-1 items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-40 max-w-full" />
                  <Skeleton className="h-3 w-56 max-w-full" />
                </div>
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-9 w-20" />
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-9 w-24" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
