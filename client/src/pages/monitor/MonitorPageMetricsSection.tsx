import { Suspense } from "react";
import {
  MonitorDeferredSectionToggle,
  MonitorMetricsFallback,
} from "@/components/monitor/MonitorDeferredSection";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { useMonitorPageContext } from "@/pages/monitor/MonitorPageContext";
import { renderMonitorSummaryBadges } from "@/pages/monitor/monitor-page-summary-badges";

const MonitorMetricsSection = lazyWithPreload(() =>
  import("@/components/monitor/MonitorMetricsSection").then((module) => ({
    default: module.MonitorMetricsSection,
  })),
);

export function MonitorPageMetricsSection() {
  const { metricsCompactSummary, metricsSummaryFacts, metricsOpen, setMetricsOpen, metricGroups } =
    useMonitorPageContext();

  return (
    <div className="space-y-3">
      <MonitorDeferredSectionToggle
        title="Key Metrics"
        statusBadgeLabel={metricsCompactSummary.badge}
        statusTone={metricsCompactSummary.tone}
        headline={metricsCompactSummary.headline}
        description={metricsCompactSummary.description}
        summaryBadges={renderMonitorSummaryBadges(metricsSummaryFacts)}
        open={metricsOpen}
        onToggle={() => setMetricsOpen((previous) => !previous)}
      />
      {metricsOpen ? (
        <Suspense fallback={<MonitorMetricsFallback />}>
          <MonitorMetricsSection metricGroups={metricGroups} embedded />
        </Suspense>
      ) : null}
    </div>
  );
}
