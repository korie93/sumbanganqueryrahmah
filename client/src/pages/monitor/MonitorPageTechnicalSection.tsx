import { Suspense, lazy } from "react";
import {
  MonitorChartsFallback,
  MonitorDeferredSectionToggle,
} from "@/components/monitor/MonitorDeferredSection";
import { useMonitorPageContext } from "@/pages/monitor/MonitorPageContext";
import { renderMonitorSummaryBadges } from "@/pages/monitor/monitor-page-summary-badges";

const MonitorTechnicalChartsSection = lazy(() =>
  import("@/components/monitor/MonitorTechnicalChartsSection").then((module) => ({
    default: module.MonitorTechnicalChartsSection,
  })),
);

export function MonitorPageTechnicalSection() {
  const {
    technicalCompactSummary,
    technicalSummaryFacts,
    technicalChartsOpen,
    setTechnicalChartsOpen,
    history,
  } = useMonitorPageContext();

  return (
    <div className="space-y-3">
      <MonitorDeferredSectionToggle
        title="Technical DevOps View"
        statusBadgeLabel={technicalCompactSummary.badge}
        statusTone={technicalCompactSummary.tone}
        headline={technicalCompactSummary.headline}
        description={technicalCompactSummary.description}
        summaryBadges={renderMonitorSummaryBadges(technicalSummaryFacts)}
        open={technicalChartsOpen}
        onToggle={() => setTechnicalChartsOpen((previous) => !previous)}
      />
      {technicalChartsOpen ? (
        <Suspense fallback={<MonitorChartsFallback />}>
          <MonitorTechnicalChartsSection history={history} embedded />
        </Suspense>
      ) : null}
    </div>
  );
}
