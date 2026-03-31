import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import type { MonitorAlert } from "@/lib/api";

type MonitorActiveAlertsListProps = {
  alerts: MonitorAlert[];
};

function MonitorActiveAlertsListImpl({ alerts }: MonitorActiveAlertsListProps) {
  if (alerts.length === 0) {
    return (
      <p className="rounded-lg border border-border/60 bg-background/45 p-3 text-sm text-muted-foreground">
        No active alerts.
      </p>
    );
  }

  return (
    <>
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`rounded-lg border p-3 ${
            alert.severity === "CRITICAL"
              ? "border-red-500/40 bg-red-500/10"
              : "border-border/60 bg-background/45"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge
              variant={alert.severity === "CRITICAL" ? "destructive" : "outline"}
              className={alert.severity === "CRITICAL" ? "font-semibold" : ""}
            >
              {alert.severity}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(alert.timestamp).toLocaleString()}
            </span>
          </div>
          <p className="mt-2 text-sm text-foreground">{alert.message}</p>
          {alert.source ? (
            <p className="mt-1 text-xs text-muted-foreground">Source: {alert.source}</p>
          ) : null}
        </div>
      ))}
    </>
  );
}

export const MonitorActiveAlertsList = memo(MonitorActiveAlertsListImpl);
