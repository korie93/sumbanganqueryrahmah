import { Skeleton } from "@/components/ui/skeleton";

export function ActivityLogsLoadingSkeleton() {
  return (
    <div
      className="space-y-4 rounded-2xl border border-border/60 bg-background/55 p-4"
      role="status"
      aria-label="Loading activity logs"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-9 w-28 rounded-xl" />
      </div>
      <div className="grid gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={`activity-logs-skeleton-${index}`}
            className="rounded-2xl border border-border/50 bg-card/70 p-3.5"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-24" />
              </div>
              <Skeleton className="h-8 w-20 rounded-full" />
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Loading activity log records</span>
    </div>
  );
}
