import { Suspense, lazy } from "react";
import { AnalysisChartsSkeleton } from "@/pages/analysis/AnalysisChartsSkeleton";

const AnalysisCharts = lazy(() =>
  import("@/pages/analysis/AnalysisCharts").then((module) => ({ default: module.AnalysisCharts })),
);

type AnalysisChartsSectionProps = {
  categoryBarData: { name: string; count: number; fill: string }[];
  genderPieData: { name: string; value: number; color: string }[];
};

export function AnalysisChartsSection({
  categoryBarData,
  genderPieData,
}: AnalysisChartsSectionProps) {
  return (
    <Suspense fallback={<AnalysisChartsSkeleton />}>
      <AnalysisCharts
        categoryBarData={categoryBarData}
        genderPieData={genderPieData}
      />
    </Suspense>
  );
}
