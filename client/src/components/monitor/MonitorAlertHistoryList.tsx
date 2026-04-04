import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import type { MonitorAlertIncident } from "@/lib/api";

type MonitorAlertHistoryListProps = {
  alertHistory: MonitorAlertIncident[];
};

function MonitorAlertHistoryListImpl({ alertHistory }: MonitorAlertHistoryListProps) {
  return (
    <div>
      {alertHistory.length === 0 ? (
        <p className="rounded-lg border border-border/60 bg-background/45 p-3 text-sm text-muted-foreground">
          No recent alert history yet.
        </p>
      ) : (
        <div className="space-y-2">
          {alertHistory.map((incident) => (
            <div
              key={incident.id}
              className="rounded-lg border border-border/60 bg-background/45 p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={incident.severity === "CRITICAL" ? "destructive" : "outline"}
                    className={incident.severity === "CRITICAL" ? "font-semibold" : ""}
                  >
                    {incident.severity}
                  </Badge>
                  <Badge variant="secondary">
                    {incident.status === "open" ? "OPEN" : "RESOLVED"}
                  </Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(incident.updatedAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-2 text-sm text-foreground">{incident.message}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                First seen {new Date(incident.firstSeenAt).toLocaleString()}
                {" | "}
                Last seen {new Date(incident.lastSeenAt).toLocaleString()}
              </p>
              {incident.source ? (
                <p className="mt-1 text-xs text-muted-foreground">Source: {incident.source}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const MonitorAlertHistoryList = memo(MonitorAlertHistoryListImpl);
