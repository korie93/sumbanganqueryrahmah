import { Skeleton } from "@/components/ui/skeleton";

export function ViewerLoadingSkeleton() {
  return (
    <div className="space-y-4" data-testid="viewer-loading-skeleton">
      <div className="rounded-xl border border-border/70 bg-background/80 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Skeleton className="h-9 w-full max-w-xl" />
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-28" />
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-background/80 p-4 shadow-sm">
        <div className="grid gap-3">
          <Skeleton className="h-5 w-48" />
          <div className="grid gap-2">
            <div className="grid grid-cols-[56px_minmax(0,2fr)_minmax(0,1.2fr)_112px] gap-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-3">
              <Skeleton className="h-4 w-8" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
            {Array.from({ length: 8 }, (_, index) => (
              <div
                key={`viewer-skeleton-row-${index}`}
                className="grid grid-cols-[56px_minmax(0,2fr)_minmax(0,1.2fr)_112px] gap-3 rounded-lg border border-border/50 px-3 py-3"
              >
                <Skeleton className="h-4 w-6" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-8 w-full rounded-xl" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
