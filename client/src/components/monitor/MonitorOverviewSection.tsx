import { memo, useMemo, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { MonitorOverviewHero } from "@/components/monitor/MonitorOverviewHero";
import { MonitorOverviewStatsGrid } from "@/components/monitor/MonitorOverviewStatsGrid";
import {
  buildMonitorOverviewCompactSummary,
  buildMonitorOverviewCompactItems,
  resolveInitialMonitorOverviewExpanded,
} from "@/components/monitor/monitor-overview-utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const [detailsOpen, setDetailsOpen] = useState(() =>
    resolveInitialMonitorOverviewExpanded(typeof window !== "undefined" ? window.innerWidth : undefined),
  );
  const compactItems = useMemo(
    () => buildMonitorOverviewCompactItems(snapshot, rollupFreshnessAgeLabel),
    [rollupFreshnessAgeLabel, snapshot],
  );
  const compactSummary = useMemo(
    () => buildMonitorOverviewCompactSummary(snapshot, rollupFreshnessAgeLabel),
    [rollupFreshnessAgeLabel, snapshot],
  );

  return (
    <section className="glass-wrapper p-4 sm:p-6">
      <MonitorOverviewHero
        snapshot={snapshot}
        scoreStatus={scoreStatus}
        modeBadgeClass={modeBadgeClass}
        rollupFreshnessStatus={rollupFreshnessStatus}
        rollupFreshnessBadgeClass={rollupFreshnessBadgeClass}
        compact={!detailsOpen}
      />
      <div className="mt-5 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {detailsOpen ? "Overview Details" : "Quick Snapshot"}
            </p>
            <p className="text-sm text-muted-foreground">
              {detailsOpen
                ? "Expand the detail grid when you need worker, queue, and alert cards."
                : compactSummary.description}
            </p>
          </div>
          {detailsOpen ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full px-4 sm:self-start"
              aria-expanded="true"
              onClick={() => setDetailsOpen((previous) => !previous)}
            >
              Compact overview
              <ChevronUp className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full px-4 sm:self-start"
              aria-expanded="false"
              onClick={() => setDetailsOpen((previous) => !previous)}
            >
              Expand overview
              <ChevronDown className="h-4 w-4" />
            </Button>
          )}
        </div>

        {!detailsOpen ? (
          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={
                      compactSummary.tone === "stable"
                        ? "rounded-full border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-600 dark:text-emerald-400"
                        : compactSummary.tone === "attention"
                          ? "rounded-full border-red-500/30 bg-red-500/10 px-3 py-1 text-xs text-red-600 dark:text-red-400"
                          : "rounded-full border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs text-amber-700 dark:text-amber-400"
                    }
                  >
                    {compactSummary.badge}
                  </Badge>
                </div>
                <p className="text-sm font-medium text-foreground">{compactSummary.headline}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {compactItems.map((item) => (
                <Badge
                  key={item.label}
                  variant="outline"
                  className="rounded-full px-3 py-1 text-xs"
                >
                  {item.label} {item.value}
                </Badge>
              ))}
            </div>
          </div>
        ) : (
          <MonitorOverviewStatsGrid
            snapshot={snapshot}
            rollupFreshnessSummary={rollupFreshnessSummary}
            rollupFreshnessAgeLabel={rollupFreshnessAgeLabel}
          />
        )}
      </div>
    </section>
  );
}

export const MonitorOverviewSection = memo(MonitorOverviewSectionImpl);
