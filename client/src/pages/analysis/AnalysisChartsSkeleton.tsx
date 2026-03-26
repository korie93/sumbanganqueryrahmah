import { Skeleton } from "@/components/ui/skeleton";

export function AnalysisChartsSkeleton() {
  return (
    <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2" data-testid="analysis-charts-skeleton">
      {Array.from({ length: 2 }, (_, index) => (
        <div key={`analysis-chart-skeleton-${index}`} className="glass-wrapper border-0 p-6">
          <Skeleton className="mb-4 h-6 w-48" />
          <Skeleton className="h-[250px] w-full" />
        </div>
      ))}
    </div>
  );
}
