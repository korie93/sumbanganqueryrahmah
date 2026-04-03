import { memo } from "react";
import { MonitorOverviewHero } from "@/components/monitor/MonitorOverviewHero";
import { MonitorOverviewStatsGrid } from "@/components/monitor/MonitorOverviewStatsGrid";
import type { RollupFreshnessStatus } from "@/components/monitor/monitorData";
import type { MetricStatus } from "@/components/monitor/MetricPanel";
import type { MonitorSnapshot } from "@/hooks/useSystemMetrics";

type MonitorOverviewSectionProps = {
  snapshot: MonitorSnapshot;
  scoreStatus: MetricStatus;
  modeBadgeClass: string;
  rollupFreshnessStatus: RollupFreshnessStatus;
  rollupFreshnessBadgeClass: string;
  rollupFreshnessSummary: string;
  rollupFreshnessAgeLabel: string;
};

function MonitorOverviewSectionImpl({
  snapshot,
  scoreStatus,
  modeBadgeClass,
  rollupFreshnessStatus,
  rollupFreshnessBadgeClass,
  rollupFreshnessSummary,
  rollupFreshnessAgeLabel,
}: MonitorOverviewSectionProps) {
  return (
    <section className="glass-wrapper p-4 sm:p-6">
      <MonitorOverviewHero
        snapshot={snapshot}
        scoreStatus={scoreStatus}
        modeBadgeClass={modeBadgeClass}
        rollupFreshnessStatus={rollupFreshnessStatus}
        rollupFreshnessBadgeClass={rollupFreshnessBadgeClass}
      />
      <MonitorOverviewStatsGrid
        snapshot={snapshot}
        rollupFreshnessSummary={rollupFreshnessSummary}
        rollupFreshnessAgeLabel={rollupFreshnessAgeLabel}
      />
    </section>
  );
}

export const MonitorOverviewSection = memo(MonitorOverviewSectionImpl);
