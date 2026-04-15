import { Suspense } from "react";
import {
  MonitorDeferredSectionToggle,
  MonitorSectionCardFallback,
} from "@/components/monitor/MonitorDeferredSection";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { useMonitorPageContext } from "@/pages/monitor/MonitorPageContext";
import { renderMonitorSummaryBadges } from "@/pages/monitor/monitor-page-summary-badges";

const MonitorChaosSection = lazyWithPreload(() =>
  import("@/components/monitor/MonitorChaosSection").then((module) => ({
    default: module.MonitorChaosSection,
  })),
);

export function MonitorPageChaosSection() {
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
        summaryBadges={renderMonitorSummaryBadges(chaosSummaryFacts)}
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
