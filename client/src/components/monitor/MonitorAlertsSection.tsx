import { memo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { MonitorActiveAlertsList } from "@/components/monitor/MonitorActiveAlertsList";
import { MonitorAlertHistoryList } from "@/components/monitor/MonitorAlertHistoryList";
import { InfoHint } from "@/components/monitor/InfoHint";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
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
  const isMobile = useIsMobile();

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
                  {isMobile ? "Alerts" : "Active Alerts"}
                  <span className="hidden sm:inline-flex">
                    <InfoHint text="Live alerts generated from monitor thresholds. Critical alerts indicate urgent action." />
                  </span>
                </span>
                {alertsOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </CollapsibleTrigger>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-[10px]">
                {alerts.length} live
              </Badge>
              <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px]">
                {alertHistory.length} history
              </Badge>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {isMobile
                ? "Live alert severity and timestamps refresh automatically."
                : "Severity, message, and timestamp refresh automatically via polling."}
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
