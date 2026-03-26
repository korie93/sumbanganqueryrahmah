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
            <Skeleton className="h-10 w-full" />
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={`viewer-skeleton-row-${index}`} className="h-12 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
