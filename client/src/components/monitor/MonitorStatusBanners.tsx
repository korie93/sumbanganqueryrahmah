import { memo, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import {
  buildMonitorStatusHeadline,
  buildMonitorStatusNotices,
  buildMonitorStatusSummaryFacts,
  buildMonitorStatusSummaryText,
  resolveInitialMonitorStatusDetailsOpen,
} from "@/components/monitor/monitor-status-banners-utils";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import type { RollupFreshnessStatus } from "@/components/monitor/monitorData";

type MonitorStatusBannersProps = {
  mode: string;
  hasNetworkFailure: boolean;
  rollupFreshnessStatus: RollupFreshnessStatus;
  rollupFreshnessSummary: string;
};

function MonitorStatusBannersImpl({
  mode,
  hasNetworkFailure,
  rollupFreshnessStatus,
  rollupFreshnessSummary,
}: MonitorStatusBannersProps) {
  const isMobile = useIsMobile();
  const notices = useMemo(
    () =>
      buildMonitorStatusNotices({
        mode,
        hasNetworkFailure,
        rollupFreshnessStatus,
        rollupFreshnessSummary,
      }),
    [hasNetworkFailure, mode, rollupFreshnessStatus, rollupFreshnessSummary],
  );
  const [detailsOpen, setDetailsOpen] = useState(() =>
    resolveInitialMonitorStatusDetailsOpen({ notices, isMobile }),
  );

  if (notices.length === 0) {
    return null;
  }

  const hasCriticalNotice = notices.some((notice) => notice.severity === "critical");
  const summaryFacts = buildMonitorStatusSummaryFacts(notices);
  const headline = buildMonitorStatusHeadline(notices);
  const summaryText = buildMonitorStatusSummaryText(notices);
  const shellClass = hasCriticalNotice
    ? "border-red-500/30 bg-red-500/10"
    : "border-amber-500/30 bg-amber-500/10";
  const textClass = hasCriticalNotice
    ? "text-red-600 dark:text-red-400"
    : "text-amber-700 dark:text-amber-400";

  return (
    <Card className={shellClass}>
      <CardContent className="space-y-3 p-3">
        <button
          type="button"
          className="flex w-full items-start justify-between gap-3 text-left"
          onClick={() => setDetailsOpen((previous) => !previous)}
          aria-expanded={detailsOpen}
        >
          <div className="min-w-0 space-y-2">
            <div className={`flex items-center gap-2 text-sm font-semibold ${textClass}`}>
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>{headline}</span>
            </div>
            <p className={`text-sm ${textClass}`}>{summaryText}</p>
            <div className="flex flex-wrap gap-2">
              {summaryFacts.map((fact) => (
                <Badge
                  key={fact.label}
                  variant="outline"
                  className={`rounded-full px-3 py-1 text-xs ${
                    fact.severity === "critical"
                      ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {fact.label} {fact.value}
                </Badge>
              ))}
              {notices.map((notice) => (
                <Badge
                  key={notice.id}
                  variant="outline"
                  className={`rounded-full px-3 py-1 text-xs ${
                    notice.severity === "critical"
                      ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
                      : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                  }`}
                >
                  {notice.badge}
                </Badge>
              ))}
            </div>
          </div>
          <span className={`shrink-0 pt-1 ${textClass}`}>
            {detailsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>

        {detailsOpen ? (
          <div className="space-y-2">
            {notices.map((notice) => (
              <div
                key={notice.id}
                className={`rounded-2xl border p-3 text-sm ${
                  notice.severity === "critical"
                    ? "border-red-500/25 bg-red-500/5 text-red-600 dark:text-red-400"
                    : "border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-400"
                }`}
              >
                <p className="font-semibold">{notice.title}</p>
                <p className={isMobile ? "mt-1 text-xs leading-6 sm:text-sm" : "mt-1"}>{notice.message}</p>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

export const MonitorStatusBanners = memo(MonitorStatusBannersImpl);
