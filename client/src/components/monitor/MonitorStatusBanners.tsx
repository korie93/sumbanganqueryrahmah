import { memo } from "react";
import { AlertTriangle } from "lucide-react";
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

  if (mode === "NORMAL" && !hasNetworkFailure && rollupFreshnessStatus === "fresh") {
    return null;
  }

  return (
    <>
      {mode !== "NORMAL" ? (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className={isMobile ? "flex items-start gap-2 p-3 text-sm text-red-600 dark:text-red-400" : "flex items-center gap-2 p-3 text-sm text-red-600 dark:text-red-400"}>
            <AlertTriangle className="h-4 w-4" />
            System is currently in {mode} mode. Performance safeguards are active.
          </CardContent>
        </Card>
      ) : null}

      {hasNetworkFailure ? (
        <Card className="border-amber-500/30 bg-amber-500/10">
          <CardContent className={isMobile ? "p-3 text-sm leading-6 text-amber-700 dark:text-amber-400" : "p-3 text-sm text-amber-700 dark:text-amber-400"}>
            Partial telemetry unavailable due to network or endpoint failure. Showing last known values.
          </CardContent>
        </Card>
      ) : null}

      {rollupFreshnessStatus !== "fresh" ? (
        <Card className={rollupFreshnessStatus === "stale" ? "border-red-500/30 bg-red-500/10" : "border-amber-500/30 bg-amber-500/10"}>
          <CardContent
            className={
              rollupFreshnessStatus === "stale"
                ? isMobile
                  ? "flex items-start gap-2 p-3 text-sm leading-6 text-red-600 dark:text-red-400"
                  : "flex items-center gap-2 p-3 text-sm text-red-600 dark:text-red-400"
                : isMobile
                  ? "flex items-start gap-2 p-3 text-sm leading-6 text-amber-700 dark:text-amber-400"
                  : "flex items-center gap-2 p-3 text-sm text-amber-700 dark:text-amber-400"
            }
          >
            <AlertTriangle className="h-4 w-4" />
            {rollupFreshnessSummary}
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

export const MonitorStatusBanners = memo(MonitorStatusBannersImpl);
