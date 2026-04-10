import { MonitorOverviewSection } from "@/components/monitor/MonitorOverviewSection";
import { MonitorStatusBanners } from "@/components/monitor/MonitorStatusBanners";
import { useMonitorPageContext } from "@/pages/monitor/MonitorPageContext";

export function MonitorPageOverviewSection() {
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
