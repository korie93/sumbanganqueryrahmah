import { Skeleton } from "@/components/ui/skeleton";

const SAVED_SKELETON_ROW_KEYS = [
  "recent-save",
  "pinned-save",
  "shared-save",
  "archived-save",
] as const;

export function SavedLoadingSkeleton() {
  return (
    <div className="space-y-4" data-testid="saved-loading-skeleton" role="status" aria-label="Loading saved imports">
      <div>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Skeleton className="h-10 w-full sm:max-w-sm" />
          <div className="grid grid-cols-1 gap-2 sm:flex sm:gap-3">
            <Skeleton className="h-10 w-full sm:w-40" />
            <Skeleton className="h-10 w-full sm:w-28" />
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div>
          <div className="flex items-center justify-between gap-3 border-b border-border p-3">
            <div className="space-y-2">
              <Skeleton className="h-5 w-32 sm:h-6 sm:w-40" />
              <Skeleton className="h-3 w-48 sm:hidden" />
            </div>
            <Skeleton className="h-5 w-5 rounded-full" />
          </div>
          {SAVED_SKELETON_ROW_KEYS.map((rowKey) => (
            <div
              key={rowKey}
              className="border-b border-border p-3 last:border-0"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
                  <Skeleton className="h-4 w-4" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-40 max-w-full" />
                    <Skeleton className="h-3 w-52 max-w-full" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-11 w-20 md:h-9" />
                  <Skeleton className="h-11 w-11 md:h-9 md:w-9" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
