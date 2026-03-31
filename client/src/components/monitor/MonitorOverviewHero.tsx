import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { InfoHint } from "@/components/monitor/InfoHint";
import type { RollupFreshnessStatus } from "@/components/monitor/monitorData";
import type { MetricStatus } from "@/components/monitor/MetricPanel";
import type { MonitorSnapshot } from "@/hooks/useSystemMetrics";

type MonitorOverviewHeroProps = {
  snapshot: MonitorSnapshot;
  scoreStatus: MetricStatus;
  modeBadgeClass: string;
  rollupFreshnessStatus: RollupFreshnessStatus;
  rollupFreshnessBadgeClass: string;
};

function MonitorOverviewHeroImpl({
  snapshot,
  scoreStatus,
  modeBadgeClass,
  rollupFreshnessStatus,
  rollupFreshnessBadgeClass,
}: MonitorOverviewHeroProps) {
  return (
    <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Executive View</p>
          <InfoHint text="High-level health summary for fast executive review." />
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">System Monitor</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Premium operational summary blending business visibility and technical diagnostics.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={
              scoreStatus === "good"
                ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-500"
                : scoreStatus === "warning"
                  ? "border-amber-500/30 bg-amber-500/15 text-amber-500"
                  : "border-red-500/30 bg-red-500/15 text-red-500"
            }
          >
            Health Status
          </Badge>
          <InfoHint text="Overall system health classification based on current telemetry score." />
          <Badge variant="outline" className={modeBadgeClass}>
            {snapshot.mode}
          </Badge>
          <InfoHint text="Current protection mode driven by runtime pressure and safety rules." />
          <Badge variant="outline" className={rollupFreshnessBadgeClass}>
            Rollup SLA {rollupFreshnessStatus.toUpperCase()}
          </Badge>
          <InfoHint text="Freshness signal for background collection report rollup updates." />
        </div>
      </div>
      <div className="text-left lg:text-right">
        <div className="flex items-center gap-2 lg:justify-end">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Performance Score</p>
          <InfoHint text="Composite score (0-100) summarizing load, latency, and failure pressure." />
        </div>
        <p className="text-[56px] font-semibold leading-none text-foreground">{snapshot.score.toFixed(0)}</p>
      </div>
    </div>
  );
}

export const MonitorOverviewHero = memo(MonitorOverviewHeroImpl);
