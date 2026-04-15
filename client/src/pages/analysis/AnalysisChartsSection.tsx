import { Suspense } from "react";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { AnalysisChartsSkeleton } from "@/pages/analysis/AnalysisChartsSkeleton";
import type { useDeferredAnalysisSectionMount } from "@/pages/analysis/useDeferredAnalysisSectionMount";

const AnalysisCharts = lazyWithPreload(() =>
  import("@/pages/analysis/AnalysisCharts").then((module) => ({ default: module.AnalysisCharts })),
);

type DeferredSectionMount = ReturnType<typeof useDeferredAnalysisSectionMount>;

type AnalysisChartsSectionProps = {
  section: DeferredSectionMount;
  categoryBarData: { name: string; count: number; fill: string }[];
  genderPieData: { name: string; value: number; color: string }[];
};

export function AnalysisChartsSection({ section, categoryBarData, genderPieData }: AnalysisChartsSectionProps) {
  return (
    <div ref={section.triggerRef}>
      {section.shouldRender ? (
        <Suspense fallback={<AnalysisChartsSkeleton />}>
          <AnalysisCharts categoryBarData={categoryBarData} genderPieData={genderPieData} />
        </Suspense>
      ) : (
        <AnalysisChartsSkeleton />
      )}
    </div>
  );
}
