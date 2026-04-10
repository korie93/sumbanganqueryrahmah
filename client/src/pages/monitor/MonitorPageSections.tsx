import { Suspense, lazy } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  OperationalPage,
  OperationalPageHeader,
} from "@/components/layout/OperationalPage";
import {
  getMonitorSummaryToneClass,
  MonitorChartsFallback,
  MonitorDeferredSectionToggle,
  MonitorInsightsFallback,
  MonitorMetricsFallback,
  MonitorSectionCardFallback,
  MonitorWebVitalsInlineFallback,
  useDeferredMonitorSectionMount,
} from "@/components/monitor/MonitorDeferredSection";
import { MonitorOverviewSection } from "@/components/monitor/MonitorOverviewSection";
import { MonitorStatusBanners } from "@/components/monitor/MonitorStatusBanners";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMonitorPageContext } from "@/pages/monitor/MonitorPageContext";

const MonitorAlertsSection = lazy(() =>
  import("@/components/monitor/MonitorAlertsSection").then((module) => ({
    default: module.MonitorAlertsSection,
  })),
);
const MonitorMetricsSection = lazy(() =>
  import("@/components/monitor/MonitorMetricsSection").then((module) => ({
    default: module.MonitorMetricsSection,
  })),
);
const MonitorChaosSection = lazy(() =>
  import("@/components/monitor/MonitorChaosSection").then((module) => ({
    default: module.MonitorChaosSection,
  })),
);
const MonitorRollupQueueControlsSection = lazy(() =>
  import("@/components/monitor/MonitorRollupQueueControlsSection").then((module) => ({
    default: module.MonitorRollupQueueControlsSection,
  })),
);
const MonitorTechnicalChartsSection = lazy(() =>
  import("@/components/monitor/MonitorTechnicalChartsSection").then((module) => ({
    default: module.MonitorTechnicalChartsSection,
  })),
);
const MonitorInsightsSection = lazy(() =>
  import("@/components/monitor/MonitorInsightsSection").then((module) => ({
    default: module.MonitorInsightsSection,
  })),
);
const MonitorWebVitalsSection = lazy(() =>
  import("@/components/monitor/MonitorWebVitalsSection").then((module) => ({
    default: module.MonitorWebVitalsSection,
  })),
);

type MonitorSummaryFact = {
  label: string;
  value: string;
  tone: "stable" | "watch" | "attention";
};

function renderSummaryFactBadges(facts: MonitorSummaryFact[]) {
  return facts.map((fact) => (
    <Badge
      key={fact.label}
      variant="outline"
      className={`rounded-full px-2.5 py-0.5 text-[10px] ${getMonitorSummaryToneClass(fact.tone)}`}
    >
      {fact.label} {fact.value}
    </Badge>
  ));
}

function MonitorPageHeaderSection() {
  const { headerDescription, headerFacts, refreshNow, isMobile, isLoading } = useMonitorPageContext();

  return (
    <OperationalPageHeader
      title={<span data-testid="text-monitor-title">System Performance</span>}
      eyebrow="Insights"
      description={headerDescription}
      badge={
        <div className="flex flex-wrap gap-2">
          {headerFacts.map((fact) => (
            <Badge
              key={fact.label}
              variant="outline"
              className={`rounded-full px-3 py-1 text-xs ${getMonitorSummaryToneClass(fact.tone)}`}
            >
              {fact.label} {fact.value}
            </Badge>
          ))}
        </div>
      }
      actions={
        <Button
          type="button"
          variant="outline"
          onClick={() => void refreshNow()}
          className={isMobile ? "w-full" : "w-full sm:w-auto"}
        >
          {isLoading ? "Refreshing..." : "Refresh"}
        </Button>
      }
      className={isMobile ? "rounded-[28px] border-border/60 bg-background/85" : undefined}
    />
  );
}

function MonitorPageOverviewSection() {
  const {
    snapshot,
    hasNetworkFailure,
    scoreStatus,
    modeBadgeClass,
    rollupFreshnessStatus,
    rollupFreshnessBadgeClass,
    rollupFreshnessSummary,
    rollupFreshnessAgeLabel,
  } = useMonitorPageContext();

  return (
    <>
      <MonitorStatusBanners
        mode={snapshot.mode}
        hasNetworkFailure={hasNetworkFailure}
        rollupFreshnessStatus={rollupFreshnessStatus}
        rollupFreshnessSummary={rollupFreshnessSummary}
      />
      <MonitorOverviewSection
        snapshot={snapshot}
        scoreStatus={scoreStatus}
        modeBadgeClass={modeBadgeClass}
        rollupFreshnessStatus={rollupFreshnessStatus}
        rollupFreshnessBadgeClass={rollupFreshnessBadgeClass}
        rollupFreshnessSummary={rollupFreshnessSummary}
        rollupFreshnessAgeLabel={rollupFreshnessAgeLabel}
      />
    </>
  );
}

function MonitorPageWebVitalsSection() {
  const {
    webVitalsCompactSummary,
    webVitalsSummaryFacts,
    webVitalsSummaryLabel,
    webVitalsOpen,
    handleWebVitalsToggle,
    webVitalsOverview,
  } = useMonitorPageContext();

  return (
    <section className="glass-wrapper p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center rounded-full border border-sky-500/20 bg-sky-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700 dark:text-sky-300">
            Real User Experience
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={`rounded-full px-3 py-1 text-xs ${getMonitorSummaryToneClass(webVitalsCompactSummary.tone)}`}
            >
              {webVitalsCompactSummary.badge}
            </Badge>
            {webVitalsSummaryFacts.map((fact) => (
              <Badge
                key={fact.label}
                variant="outline"
                className={`rounded-full px-3 py-1 text-xs ${getMonitorSummaryToneClass(fact.tone)}`}
              >
                {fact.label} {fact.value}
              </Badge>
            ))}
          </div>
          <div className="space-y-1">
            <h2 className="text-lg font-semibold tracking-tight text-foreground sm:text-xl">
              {webVitalsCompactSummary.headline}
            </h2>
            <p className="max-w-3xl text-sm text-muted-foreground">{webVitalsSummaryLabel}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {webVitalsOpen ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full px-4"
              aria-expanded="true"
              onClick={handleWebVitalsToggle}
            >
              Hide information
              <ChevronUp className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full px-4"
              aria-expanded="false"
              onClick={handleWebVitalsToggle}
            >
              Information
              <ChevronDown className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {webVitalsOpen ? (
        <div className="mt-6">
          <Suspense fallback={<MonitorWebVitalsInlineFallback />}>
            <MonitorWebVitalsSection overview={webVitalsOverview} embedded />
          </Suspense>
        </div>
      ) : null}
    </section>
  );
}

function MonitorPageMetricsSection() {
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
        summaryBadges={renderSummaryFactBadges(metricsSummaryFacts)}
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

function MonitorPageRollupControlsSection() {
  const {
    deferSecondaryMobileSections,
    canManageRollups,
    snapshot,
    queueActionBusy,
    lastQueueActionMessage,
    runRollupAction,
  } = useMonitorPageContext();
  const { shouldRender, triggerRef } = useDeferredMonitorSectionMount({
    enabled: deferSecondaryMobileSections && canManageRollups,
  });

  if (!canManageRollups) {
    return null;
  }

  return (
    <div ref={triggerRef}>
      {shouldRender ? (
        <Suspense fallback={<MonitorSectionCardFallback title="Loading rollup controls" />}>
          <MonitorRollupQueueControlsSection
            canManageRollups={canManageRollups}
            snapshot={snapshot}
            busyAction={queueActionBusy}
            lastMessage={lastQueueActionMessage}
            onDrain={() => void runRollupAction("drain")}
            onRetryFailures={() => void runRollupAction("retry-failures")}
            onAutoHeal={() => void runRollupAction("auto-heal")}
            onRebuild={() => void runRollupAction("rebuild")}
          />
        </Suspense>
      ) : (
        <MonitorSectionCardFallback title="Loading rollup controls" />
      )}
    </div>
  );
}

function MonitorPageAlertsSection() {
  const {
    deferSecondaryMobileSections,
    alertsOpen,
    setAlertsOpen,
    alertHistoryOpen,
    setAlertHistoryOpen,
    alerts,
    alertsPage,
    alertsPagination,
    setAlertsPage,
    alertHistory,
    alertHistoryPage,
    alertHistoryPagination,
    setAlertHistoryPage,
    canDeleteAlertHistory,
    deleteAlertHistoryBusy,
    handleDeleteOldAlertHistory,
  } = useMonitorPageContext();
  const { shouldRender, triggerRef } = useDeferredMonitorSectionMount({
    enabled: deferSecondaryMobileSections,
  });

  return (
    <div ref={triggerRef}>
      {shouldRender ? (
        <Suspense fallback={<MonitorSectionCardFallback title="Loading alerts" blocks={3} />}>
          <MonitorAlertsSection
            alertsOpen={alertsOpen}
            onAlertsOpenChange={setAlertsOpen}
            alertHistoryOpen={alertHistoryOpen}
            onAlertHistoryOpenChange={setAlertHistoryOpen}
            alerts={alerts}
            alertsPage={alertsPage}
            alertsPagination={alertsPagination}
            onAlertsPageChange={setAlertsPage}
            alertHistory={alertHistory}
            alertHistoryPage={alertHistoryPage}
            alertHistoryPagination={alertHistoryPagination}
            onAlertHistoryPageChange={setAlertHistoryPage}
            canDeleteHistory={canDeleteAlertHistory}
            deleteHistoryBusy={deleteAlertHistoryBusy}
            onDeleteOldHistory={handleDeleteOldAlertHistory}
          />
        </Suspense>
      ) : (
        <MonitorSectionCardFallback title="Loading alerts" blocks={3} />
      )}
    </div>
  );
}

function MonitorPageInsightsSection() {
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
        summaryBadges={renderSummaryFactBadges(insightsSummaryFacts)}
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

function MonitorPageChaosSection() {
  const {
    chaosCompactSummary,
    chaosSummaryFacts,
    chaosSectionOpen,
    setChaosSectionOpen,
    canInjectChaos,
    chaosType,
    selectedChaosProfile,
    chaosMagnitude,
    chaosDurationMs,
    chaosLoading,
    lastChaosMessage,
    handleChaosTypeChange,
    setChaosMagnitude,
    setChaosDurationMs,
    submitChaos,
  } = useMonitorPageContext();

  return (
    <div className="space-y-3">
      <MonitorDeferredSectionToggle
        title="Chaos Lab"
        statusBadgeLabel={chaosCompactSummary.badge}
        statusTone={chaosCompactSummary.tone}
        headline={chaosCompactSummary.headline}
        description={chaosCompactSummary.description}
        summaryBadges={renderSummaryFactBadges(chaosSummaryFacts)}
        open={chaosSectionOpen}
        onToggle={() => setChaosSectionOpen((previous) => !previous)}
      />
      {chaosSectionOpen ? (
        <Suspense fallback={<MonitorSectionCardFallback title="Loading chaos lab" blocks={2} />}>
          <MonitorChaosSection
            canInjectChaos={canInjectChaos}
            chaosType={chaosType}
            selectedChaosProfile={selectedChaosProfile}
            chaosMagnitude={chaosMagnitude}
            chaosDurationMs={chaosDurationMs}
            chaosLoading={chaosLoading}
            lastChaosMessage={lastChaosMessage}
            onChaosTypeChange={handleChaosTypeChange}
            onChaosMagnitudeChange={setChaosMagnitude}
            onChaosDurationChange={setChaosDurationMs}
            onSubmit={submitChaos}
            embedded
          />
        </Suspense>
      ) : null}
    </div>
  );
}

function MonitorPageTechnicalSection() {
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
        summaryBadges={renderSummaryFactBadges(technicalSummaryFacts)}
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

function MonitorPageFooter() {
  const { isMobile, isLoading, lastUpdatedLabel } = useMonitorPageContext();

  return (
    <p className={isMobile ? "text-left text-xs text-muted-foreground" : "text-right text-xs text-muted-foreground"}>
      {isLoading ? "Loading..." : `Last updated: ${lastUpdatedLabel}`}
    </p>
  );
}

export function MonitorPageShell() {
  return (
    <OperationalPage width="content" className="space-y-4 sm:space-y-6">
      <MonitorPageHeaderSection />

      <div className="space-y-4 sm:space-y-6">
        <MonitorPageOverviewSection />
        <MonitorPageWebVitalsSection />
        <MonitorPageMetricsSection />
        <MonitorPageRollupControlsSection />
        <MonitorPageAlertsSection />
        <MonitorPageInsightsSection />
        <MonitorPageChaosSection />
        <MonitorPageTechnicalSection />
        <MonitorPageFooter />
      </div>
    </OperationalPage>
  );
}
