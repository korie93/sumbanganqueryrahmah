import { memo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { MonitorActiveAlertsList } from "@/components/monitor/MonitorActiveAlertsList";
import { MonitorAlertHistoryList } from "@/components/monitor/MonitorAlertHistoryList";
import { InfoHint } from "@/components/monitor/InfoHint";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { MonitorAlert, MonitorAlertIncident } from "@/lib/api";

type MonitorAlertsSectionProps = {
  alertsOpen: boolean;
  onAlertsOpenChange: (open: boolean) => void;
  alerts: MonitorAlert[];
  alertHistory: MonitorAlertIncident[];
};

function MonitorAlertsSectionImpl({
  alertsOpen,
  onAlertsOpenChange,
  alerts,
  alertHistory,
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
              <MonitorActiveAlertsList alerts={alerts} />
              <MonitorAlertHistoryList alertHistory={alertHistory} />
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>
    </section>
  );
}

export const MonitorAlertsSection = memo(MonitorAlertsSectionImpl);
