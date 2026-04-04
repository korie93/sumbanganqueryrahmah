import { memo, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  buildMonitorAlertsCompactSummary,
  buildMonitorAlertsSummaryFacts,
  type MonitorAlertSummaryTone,
} from "@/components/monitor/monitor-alerts-utils";
import { MonitorActiveAlertsList } from "@/components/monitor/MonitorActiveAlertsList";
import { MonitorAlertHistoryList } from "@/components/monitor/MonitorAlertHistoryList";
import { InfoHint } from "@/components/monitor/InfoHint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useIsMobile } from "@/hooks/use-mobile";
import type { MonitorAlert, MonitorAlertIncident, MonitorPagination } from "@/lib/api";

const HISTORY_RETENTION_OPTIONS = [7, 30, 90, 180] as const;

type MonitorAlertsSectionProps = {
  alertsOpen: boolean;
  onAlertsOpenChange: (open: boolean) => void;
  alertHistoryOpen: boolean;
  onAlertHistoryOpenChange: (open: boolean) => void;
  alerts: MonitorAlert[];
  alertsPage: number;
  alertsPagination: MonitorPagination;
  onAlertsPageChange: (page: number) => void;
  alertHistory: MonitorAlertIncident[];
  alertHistoryPage: number;
  alertHistoryPagination: MonitorPagination;
  onAlertHistoryPageChange: (page: number) => void;
  canDeleteHistory: boolean;
  deleteHistoryBusy: boolean;
  onDeleteOldHistory: (olderThanDays: number) => void | Promise<void>;
};

function getMonitorAlertSummaryToneClass(tone: MonitorAlertSummaryTone) {
  if (tone === "attention") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }

  if (tone === "watch") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }

  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
}

function MonitorAlertsPagination({
  page,
  totalPages,
  totalItems,
  label,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalItems: number;
  label: string;
  onPageChange: (page: number) => void;
}) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/45 px-3 py-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>
        Page {page} of {totalPages} - {totalItems} {label}
      </span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-3"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Prev
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 px-3"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}

function MonitorAlertsSubsectionToggle({
  title,
  description,
  open,
  onToggle,
  badges,
}: {
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  badges?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/40 p-3">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        onClick={onToggle}
        aria-expanded={open ? "true" : "false"}
      >
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">{title}</span>
            {badges}
          </div>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <span className="shrink-0 pt-1 text-muted-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>
    </div>
  );
}

function MonitorAlertsSectionImpl({
  alertsOpen,
  onAlertsOpenChange,
  alertHistoryOpen,
  onAlertHistoryOpenChange,
  alerts,
  alertsPage,
  alertsPagination,
  onAlertsPageChange,
  alertHistory,
  alertHistoryPage,
  alertHistoryPagination,
  onAlertHistoryPageChange,
  canDeleteHistory,
  deleteHistoryBusy,
  onDeleteOldHistory,
}: MonitorAlertsSectionProps) {
  const isMobile = useIsMobile();
  const [liveAlertsOpen, setLiveAlertsOpen] = useState(true);
  const [historyRetentionDays, setHistoryRetentionDays] = useState(String(HISTORY_RETENTION_OPTIONS[1]));
  const alertsCompactSummary = useMemo(
    () =>
      buildMonitorAlertsCompactSummary({
        alerts,
        alertsPagination,
        alertHistoryPagination,
      }),
    [alertHistoryPagination, alerts, alertsPagination],
  );
  const alertsSummaryFacts = useMemo(
    () =>
      buildMonitorAlertsSummaryFacts({
        alerts,
        alertsPagination,
        alertHistoryPagination,
      }),
    [alertHistoryPagination, alerts, alertsPagination],
  );
  const resolvedHistoryCount = useMemo(
    () => alertHistory.filter((incident) => incident.status === "resolved").length,
    [alertHistory],
  );

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
              <Badge
                variant="outline"
                className={`rounded-full px-2.5 py-0.5 text-[10px] ${getMonitorAlertSummaryToneClass(alertsCompactSummary.tone)}`}
              >
                {alertsCompactSummary.badge}
              </Badge>
              {alertsSummaryFacts.map((fact) => (
                <Badge
                  key={fact.label}
                  variant="outline"
                  className={`rounded-full px-2.5 py-0.5 text-[10px] ${getMonitorAlertSummaryToneClass(fact.tone)}`}
                >
                  {fact.label} {fact.value}
                </Badge>
              ))}
            </div>
            <div className="mt-3 space-y-1">
              <p className="text-sm font-semibold text-foreground">{alertsCompactSummary.headline}</p>
              <p className="text-xs text-muted-foreground">
                {alertsCompactSummary.description}
                {alertsOpen
                  ? ""
                  : isMobile
                    ? " Open this section only when you need live cards or history."
                    : " Open this section only when you need live cards, history, or cleanup controls."}
              </p>
            </div>
            <CollapsibleContent className="mt-3 space-y-2">
              <div className="space-y-2">
                <MonitorAlertsSubsectionToggle
                  title="Live incidents"
                  description="Open current alert cards only when you need active severity and source details."
                  open={liveAlertsOpen}
                  onToggle={() => setLiveAlertsOpen((previous) => !previous)}
                  badges={(
                    <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-[10px]">
                      {alertsPagination.totalItems} live
                    </Badge>
                  )}
                />
                {liveAlertsOpen ? (
                  <div className="space-y-2">
                    <MonitorActiveAlertsList alerts={alerts} />
                    <MonitorAlertsPagination
                      page={alertsPage}
                      totalPages={alertsPagination.totalPages}
                      totalItems={alertsPagination.totalItems}
                      label="live alerts"
                      onPageChange={onAlertsPageChange}
                    />
                  </div>
                ) : null}
              </div>

              <div className="space-y-2 pt-2">
                <MonitorAlertsSubsectionToggle
                  title="Recent alert history"
                  description="Open persistent incident history only when you need resolved timelines, pagination, or cleanup."
                  open={alertHistoryOpen}
                  onToggle={() => onAlertHistoryOpenChange(!alertHistoryOpen)}
                  badges={(
                    <>
                      <Badge variant="outline" className="rounded-full px-2.5 py-0.5 text-[10px]">
                        {alertHistoryPagination.totalItems} total
                      </Badge>
                      {alertHistoryOpen ? (
                        <Badge variant="secondary" className="rounded-full px-2.5 py-0.5 text-[10px]">
                          {resolvedHistoryCount} resolved on this page
                        </Badge>
                      ) : null}
                    </>
                  )}
                />
                {alertHistoryOpen ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      History and cleanup controls
                      <InfoHint text="Persistent incident history showing recently opened and resolved monitor alerts." />
                    </div>

                    {canDeleteHistory ? (
                      <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-background/40 p-3 sm:items-end">
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                          <select
                            value={historyRetentionDays}
                            onChange={(event) => setHistoryRetentionDays(event.target.value)}
                            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                            disabled={deleteHistoryBusy}
                            aria-label="Delete resolved alert history older than"
                          >
                            {HISTORY_RETENTION_OPTIONS.map((days) => (
                              <option key={days} value={String(days)}>
                                Older than {days} days
                              </option>
                            ))}
                          </select>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9"
                            disabled={deleteHistoryBusy || alertHistoryPagination.totalItems === 0}
                            onClick={() => onDeleteOldHistory(Number(historyRetentionDays))}
                          >
                            {deleteHistoryBusy ? "Deleting..." : "Delete old resolved"}
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          Only resolved incidents older than the selected age are removed.
                        </p>
                      </div>
                    ) : null}

                    <MonitorAlertHistoryList alertHistory={alertHistory} />
                    <MonitorAlertsPagination
                      page={alertHistoryPage}
                      totalPages={alertHistoryPagination.totalPages}
                      totalItems={alertHistoryPagination.totalItems}
                      label="history records"
                      onPageChange={onAlertHistoryPageChange}
                    />
                  </div>
                ) : null}
              </div>
            </CollapsibleContent>
          </CardContent>
        </Card>
      </Collapsible>
    </section>
  );
}

export const MonitorAlertsSection = memo(MonitorAlertsSectionImpl);
