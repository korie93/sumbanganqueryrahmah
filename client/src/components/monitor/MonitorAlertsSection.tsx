import { memo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { InfoHint } from "@/components/monitor/InfoHint";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { MonitorAlert } from "@/lib/api";

type MonitorAlertsSectionProps = {
  alertsOpen: boolean;
  onAlertsOpenChange: (open: boolean) => void;
  alerts: MonitorAlert[];
};

function MonitorAlertsSectionImpl({
  alertsOpen,
  onAlertsOpenChange,
  alerts,
}: MonitorAlertsSectionProps) {
  return (
    <section>
      <Collapsible open={alertsOpen} onOpenChange={onAlertsOpenChange}>
        <Card className="border-border/60 bg-background/35 backdrop-blur-sm">
          <CardContent className="p-4">
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md px-1 text-left"
                data-testid="monitor-alerts-toggle"
              >
                <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Active Alerts
                  <InfoHint text="Live alerts generated from monitor thresholds. Critical alerts indicate urgent action." />
                </span>
                {alertsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </CollapsibleTrigger>
            <p className="mt-2 text-xs text-muted-foreground">
              Severity, message, and timestamp refresh automatically via polling.
            </p>
            <CollapsibleContent className="mt-3 space-y-2">
              {alerts.length === 0 ? (
                <p className="rounded-lg border border-border/60 bg-background/45 p-3 text-sm text-muted-foreground">
                  No active alerts.
                </p>
              ) : (
                alerts.map((alert) => (
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
                ))
              )}
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>
    </section>
  );
}

export const MonitorAlertsSection = memo(MonitorAlertsSectionImpl);
