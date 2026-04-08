import { Suspense, lazy } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  OperationalPage,
  OperationalPageHeader,
} from "@/components/layout/OperationalPage";
import { MonitorAccessDenied } from "@/components/monitor/MonitorAccessDenied";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useMonitorPageState } from "@/pages/monitor/useMonitorPageState";

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

export default function Monitor() {
  const {
    isMobile,
    isLoading,
    snapshot,
    history,
    alerts,
    alertsPagination,
    alertHistory,
    alertHistoryPagination,
    intelligence,
    webVitalsOverview,
    accessDenied,
    hasNetworkFailure,
    lastUpdated,
    refreshNow,
    metricsOpen,
    setMetricsOpen,
    alertsOpen,
    setAlertsOpen,
    alertHistoryOpen,
    setAlertHistoryOpen,
    alertsPage,
    setAlertsPage,
    alertHistoryPage,
    setAlertHistoryPage,
    insightsOpen,
    setInsightsOpen,
    chaosType,
    chaosMagnitude,
    setChaosMagnitude,
    chaosDurationMs,
    setChaosDurationMs,
    chaosLoading,
    lastChaosMessage,
    webVitalsOpen,
    handleWebVitalsToggle,
    chaosSectionOpen,
    setChaosSectionOpen,
    technicalChartsOpen,
    setTechnicalChartsOpen,
    deleteAlertHistoryBusy,
    queueActionBusy,
    lastQueueActionMessage,
    canInjectChaos,
    canDeleteAlertHistory,
    canManageRollups,
    deferSecondaryMobileSections,
    lastUpdatedLabel,
    selectedChaosProfile,
    scoreStatus,
    modeBadgeClass,
    rollupFreshnessStatus,
    rollupFreshnessBadgeClass,
    rollupFreshnessSummary,
    rollupFreshnessAgeLabel,
    webVitalsCompactSummary,
    metricsCompactSummary,
    metricsSummaryFacts,
    chaosCompactSummary,
    chaosSummaryFacts,
    technicalCompactSummary,
    technicalSummaryFacts,
    insightsCompactSummary,
    insightsSummaryFacts,
    webVitalsSummaryFacts,
    webVitalsSummaryLabel,
    headerDescription,
    headerFacts,
    metricGroups,
    handleChaosTypeChange,
    handleDeleteOldAlertHistory,
    submitChaos,
    runRollupAction,
  } = useMonitorPageState();
  const { shouldRender: shouldRenderRollupControls, triggerRef: rollupControlsTriggerRef } =
    useDeferredMonitorSectionMount({ enabled: deferSecondaryMobileSections && canManageRollups });
  const { shouldRender: shouldRenderAlerts, triggerRef: alertsTriggerRef } =
    useDeferredMonitorSectionMount({ enabled: deferSecondaryMobileSections });

  if (accessDenied) {
    return <MonitorAccessDenied />;
  }

  return (
    <OperationalPage width="content" className="space-y-4 sm:space-y-6">
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

      <div className="space-y-4 sm:space-y-6">
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
                <p className="max-w-3xl text-sm text-muted-foreground">
                  {webVitalsSummaryLabel}
                </p>
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
        <div className="space-y-3">
          <MonitorDeferredSectionToggle
            title="Key Metrics"
            statusBadgeLabel={metricsCompactSummary.badge}
            statusTone={metricsCompactSummary.tone}
            headline={metricsCompactSummary.headline}
            description={metricsCompactSummary.description}
            summaryBadges={metricsSummaryFacts.map((fact) => (
              <Badge
                key={fact.label}
                variant="outline"
                className={`rounded-full px-2.5 py-0.5 text-[10px] ${getMonitorSummaryToneClass(fact.tone)}`}
              >
                {fact.label} {fact.value}
              </Badge>
            ))}
            open={metricsOpen}
            onToggle={() => setMetricsOpen((previous) => !previous)}
          />
          {metricsOpen ? (
            <Suspense fallback={<MonitorMetricsFallback />}>
              <MonitorMetricsSection metricGroups={metricGroups} embedded />
            </Suspense>
          ) : null}
        </div>
        {canManageRollups ? (
          <div ref={rollupControlsTriggerRef}>
            {shouldRenderRollupControls ? (
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
        ) : null}
        <div ref={alertsTriggerRef}>
          {shouldRenderAlerts ? (
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
        <div className="space-y-3">
          <MonitorDeferredSectionToggle
            title="Intelligence Insights"
            statusBadgeLabel={insightsCompactSummary.badge}
            statusTone={insightsCompactSummary.tone}
            headline={insightsCompactSummary.headline}
            description={insightsCompactSummary.description}
            summaryBadges={insightsSummaryFacts.map((fact) => (
              <Badge
                key={fact.label}
                variant="outline"
                className={`rounded-full px-2.5 py-0.5 text-[10px] ${getMonitorSummaryToneClass(fact.tone)}`}
              >
                {fact.label} {fact.value}
              </Badge>
            ))}
            open={insightsOpen}
            onToggle={() => setInsightsOpen((previous) => !previous)}
          />
          {insightsOpen ? (
            <Suspense fallback={<MonitorInsightsFallback />}>
              <MonitorInsightsSection intelligence={intelligence} lastUpdated={lastUpdated} embedded />
            </Suspense>
          ) : null}
        </div>
        <div className="space-y-3">
          <MonitorDeferredSectionToggle
            title="Chaos Lab"
            statusBadgeLabel={chaosCompactSummary.badge}
            statusTone={chaosCompactSummary.tone}
            headline={chaosCompactSummary.headline}
            description={chaosCompactSummary.description}
            summaryBadges={chaosSummaryFacts.map((fact) => (
              <Badge
                key={fact.label}
                variant="outline"
                className={`rounded-full px-2.5 py-0.5 text-[10px] ${getMonitorSummaryToneClass(fact.tone)}`}
              >
                {fact.label} {fact.value}
              </Badge>
            ))}
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
        <div className="space-y-3">
          <MonitorDeferredSectionToggle
            title="Technical DevOps View"
            statusBadgeLabel={technicalCompactSummary.badge}
            statusTone={technicalCompactSummary.tone}
            headline={technicalCompactSummary.headline}
            description={technicalCompactSummary.description}
            summaryBadges={technicalSummaryFacts.map((fact) => (
              <Badge
                key={fact.label}
                variant="outline"
                className={`rounded-full px-2.5 py-0.5 text-[10px] ${getMonitorSummaryToneClass(fact.tone)}`}
              >
                {fact.label} {fact.value}
              </Badge>
            ))}
            open={technicalChartsOpen}
            onToggle={() => setTechnicalChartsOpen((previous) => !previous)}
          />
          {technicalChartsOpen ? (
            <Suspense fallback={<MonitorChartsFallback />}>
              <MonitorTechnicalChartsSection history={history} embedded />
            </Suspense>
          ) : null}
        </div>

        <p className={isMobile ? "text-left text-xs text-muted-foreground" : "text-right text-xs text-muted-foreground"}>
          {isLoading ? "Loading..." : `Last updated: ${lastUpdatedLabel}`}
        </p>
      </div>
    </OperationalPage>
  );
}
