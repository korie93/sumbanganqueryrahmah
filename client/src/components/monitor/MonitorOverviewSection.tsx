import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { InfoHint } from "@/components/monitor/InfoHint";
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
    <section className="glass-wrapper p-6">
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

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="border-border/60 bg-background/45">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">System Mode</p>
              <InfoHint text="Operational state: NORMAL, DEGRADED, or PROTECTION." />
            </div>
            <p className="mt-2 text-2xl font-semibold">{snapshot.mode}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-background/45">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Bottleneck Type</p>
              <InfoHint text="Primary pressure source currently limiting performance." />
            </div>
            <p className="mt-2 text-2xl font-semibold">{snapshot.bottleneckType}</p>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-background/45">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Worker Count</p>
              <InfoHint text="Active workers versus configured worker capacity." />
            </div>
            <p className="mt-2 text-2xl font-semibold">
              {snapshot.workerCount} / {snapshot.maxWorkers}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-background/45">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Rollup Queue</p>
              <InfoHint text="Pending background refresh slices keeping collection report rollups up to date." />
            </div>
            <p className="mt-2 text-2xl font-semibold">{snapshot.rollupRefreshPendingCount}</p>
            <p className="mt-1 text-xs text-muted-foreground">{rollupFreshnessSummary}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {snapshot.rollupRefreshRunningCount} running, {snapshot.rollupRefreshRetryCount} retry, oldest {rollupFreshnessAgeLabel}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/60 bg-background/45">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Active Alert Count</p>
              <InfoHint text="Number of currently open alerts generated by monitor rules." />
            </div>
            <p className="mt-2 text-2xl font-semibold">{snapshot.activeAlertCount}</p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

export const MonitorOverviewSection = memo(MonitorOverviewSectionImpl);
