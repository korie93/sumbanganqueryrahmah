import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { InfoHint } from "@/components/monitor/InfoHint";
import { useIsMobile } from "@/hooks/use-mobile";
import type { RollupFreshnessStatus } from "@/components/monitor/monitorData";
import type { MetricStatus } from "@/components/monitor/MetricPanel";
import type { MonitorSnapshot } from "@/hooks/useSystemMetrics";

type MonitorOverviewHeroProps = {
  snapshot: MonitorSnapshot;
  scoreStatus: MetricStatus;
  modeBadgeClass: string;
  rollupFreshnessStatus: RollupFreshnessStatus;
  rollupFreshnessBadgeClass: string;
  compact?: boolean;
};

function MonitorOverviewHeroImpl({
  snapshot,
  scoreStatus,
  modeBadgeClass,
  rollupFreshnessStatus,
  rollupFreshnessBadgeClass,
  compact = false,
}: MonitorOverviewHeroProps) {
  const isMobile = useIsMobile();

  return (
    <div className="flex flex-col gap-4 sm:gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Executive View</p>
          {!compact ? (
            <span className="hidden sm:inline-flex">
              <InfoHint text="High-level health summary for fast executive review." />
            </span>
          ) : null}
        </div>
        <h1 className="mt-2 text-xl font-semibold text-foreground sm:text-2xl">System Monitor</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {compact
            ? isMobile
              ? "Live health snapshot for operators."
              : "Condensed operational summary for quick health checks."
            : isMobile
              ? "Live health summary for app load, queue pressure, and runtime stability."
              : "Premium operational summary blending business visibility and technical diagnostics."}
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
            {isMobile ? "Health" : "Health Status"}
          </Badge>
          {!compact ? (
            <span className="hidden sm:inline-flex">
              <InfoHint text="Overall system health classification based on current telemetry score." />
            </span>
          ) : null}
          <Badge variant="outline" className={modeBadgeClass}>
            {snapshot.mode}
          </Badge>
          {!compact ? (
            <span className="hidden sm:inline-flex">
              <InfoHint text="Current protection mode driven by runtime pressure and safety rules." />
            </span>
          ) : null}
          <Badge variant="outline" className={rollupFreshnessBadgeClass}>
            {isMobile ? `Rollup ${rollupFreshnessStatus}` : `Rollup SLA ${rollupFreshnessStatus.toUpperCase()}`}
          </Badge>
          {!compact ? (
            <span className="hidden sm:inline-flex">
              <InfoHint text="Freshness signal for background collection report rollup updates." />
            </span>
          ) : null}
        </div>
      </div>
      <div className="text-left lg:text-right">
        <div className="flex items-center gap-2 lg:justify-end">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {compact ? (isMobile ? "Live Score" : "Health Score") : isMobile ? "Score" : "Performance Score"}
          </p>
          {!compact ? (
            <span className="hidden sm:inline-flex">
              <InfoHint text="Composite score (0-100) summarizing load, latency, and failure pressure." />
            </span>
          ) : null}
        </div>
        <p
          className={
            compact
              ? "text-[38px] font-semibold leading-none text-foreground sm:text-[48px]"
              : "text-[44px] font-semibold leading-none text-foreground sm:text-[56px]"
          }
        >
          {snapshot.score.toFixed(0)}
        </p>
      </div>
    </div>
  );
}

export const MonitorOverviewHero = memo(MonitorOverviewHeroImpl);
