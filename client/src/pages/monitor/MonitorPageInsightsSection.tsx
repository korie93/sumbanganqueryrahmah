import { Suspense } from "react";
import {
  MonitorDeferredSectionToggle,
  MonitorInsightsFallback,
} from "@/components/monitor/MonitorDeferredSection";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { useMonitorPageContext } from "@/pages/monitor/MonitorPageContext";
import { renderMonitorSummaryBadges } from "@/pages/monitor/monitor-page-summary-badges";

const MonitorInsightsSection = lazyWithPreload(() =>
  import("@/components/monitor/MonitorInsightsSection").then((module) => ({
    default: module.MonitorInsightsSection,
  })),
);

export function MonitorPageInsightsSection() {
  const {
    insightsCompactSummary,
    insightsSummaryFacts,
    insightsOpen,
    setInsightsOpen,
    intelligence,
    lastUpdated,
  } = useMonitorPageContext();

  return (
    <div className="space-y-3">
      <MonitorDeferredSectionToggle
        title="Intelligence Insights"
        statusBadgeLabel={insightsCompactSummary.badge}
        statusTone={insightsCompactSummary.tone}
        headline={insightsCompactSummary.headline}
        description={insightsCompactSummary.description}
        summaryBadges={renderMonitorSummaryBadges(insightsSummaryFacts)}
        open={insightsOpen}
        onToggle={() => setInsightsOpen((previous) => !previous)}
      />
      {insightsOpen ? (
        <Suspense fallback={<MonitorInsightsFallback />}>
          <MonitorInsightsSection intelligence={intelligence} lastUpdated={lastUpdated} embedded />
        </Suspense>
      ) : null}
    </div>
  );
}
