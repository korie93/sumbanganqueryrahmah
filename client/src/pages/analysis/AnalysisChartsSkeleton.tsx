import { Skeleton } from "@/components/ui/skeleton";

const ANALYSIS_CHART_SKELETON_KEYS = [
  "primary-chart",
  "secondary-chart",
] as const;

export function AnalysisChartsSkeleton() {
  return (
    <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2" data-testid="analysis-charts-skeleton">
      {ANALYSIS_CHART_SKELETON_KEYS.map((chartKey) => (
        <div key={chartKey} className="glass-wrapper border-0 p-6">
          <Skeleton className="mb-4 h-6 w-48" />
          <Skeleton className="h-[250px] w-full" />
        </div>
      ))}
    </div>
  );
}
