import { Skeleton } from "@/components/ui/skeleton";

export function SavedLoadingSkeleton() {
  return (
    <div className="space-y-4" data-testid="saved-loading-skeleton">
      <div className="rounded-xl border border-border/70 bg-background/80 p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Skeleton className="h-10 w-full sm:max-w-sm" />
          <div className="grid grid-cols-1 gap-2 sm:flex sm:gap-3">
            <Skeleton className="h-10 w-full sm:w-40" />
            <Skeleton className="h-10 w-full sm:w-28" />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border/70 bg-background/80 p-3 shadow-sm sm:p-4">
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-2">
              <Skeleton className="h-5 w-32 sm:h-6 sm:w-40" />
              <Skeleton className="h-3 w-48 sm:hidden" />
            </div>
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
          {Array.from({ length: 4 }, (_, index) => (
            <div
              key={`saved-skeleton-row-${index}`}
              className="rounded-xl border border-border/60 bg-background/70 p-3 sm:p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-40 max-w-full" />
                    <Skeleton className="h-3 w-52 max-w-full" />
                    <div className="flex flex-wrap gap-2">
                      <Skeleton className="h-5 w-28 rounded-full" />
                      <Skeleton className="h-5 w-20 rounded-full" />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:flex">
                  <Skeleton className="h-9 w-full sm:w-20" />
                  <Skeleton className="h-9 w-full sm:w-24" />
                  <Skeleton className="h-9 w-full sm:w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
