import { memo } from "react";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

type MonitorStatusBannersProps = {
  mode: string;
  hasNetworkFailure: boolean;
};

function MonitorStatusBannersImpl({ mode, hasNetworkFailure }: MonitorStatusBannersProps) {
  if (mode === "NORMAL" && !hasNetworkFailure) {
    return null;
  }

  return (
    <>
      {mode !== "NORMAL" ? (
        <Card className="border-red-500/30 bg-red-500/10">
          <CardContent className="flex items-center gap-2 p-3 text-sm text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            System is currently in {mode} mode. Performance safeguards are active.
          </CardContent>
        </Card>
      ) : null}

      {hasNetworkFailure ? (
        <Card className="border-amber-500/30 bg-amber-500/10">
          <CardContent className="p-3 text-sm text-amber-700 dark:text-amber-400">
            Partial telemetry unavailable due to network or endpoint failure. Showing last known values.
          </CardContent>
        </Card>
      ) : null}
    </>
  );
}

export const MonitorStatusBanners = memo(MonitorStatusBannersImpl);
