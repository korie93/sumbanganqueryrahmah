import {
  Activity,
  Ban,
  Clock3,
  Computer,
  Laptop,
  Network,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserX,
} from "lucide-react";
import { useRef } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ActivityInvestigation } from "@/lib/api";
import type { ActivityRecord } from "@/pages/activity/types";
import { formatActivityTime, getStatusBadge } from "@/pages/activity/utils";
import { useActivityInvestigation } from "@/pages/activity/useActivityInvestigation";
import { getActivityDeviceTypeLabel } from "@/pages/activity/activity-device-utils";
import { ActivityInvestigationRelatedSessions } from "@/pages/activity/ActivityInvestigationRelatedSessions";

type ActivityInvestigationDrawerProps = {
  activity: ActivityRecord | null;
  actionLoading: string | null;
  onBan: (activity: ActivityRecord) => void;
  onDelete: (activity: ActivityRecord) => void;
  onKick: (activity: ActivityRecord) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

function findInvestigationTrigger(activityId: string | null | undefined): HTMLElement | null {
  if (!activityId || typeof document === "undefined") {
    return null;
  }
  const expectedTestId = `button-investigate-${activityId}`;
  return Array.from(
    document.querySelectorAll<HTMLElement>("[data-testid^='button-investigate-']"),
  ).find((element) => element.dataset.testid === expectedTestId) ?? null;
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) {
    return "Not available";
  }
  const totalMinutes = Math.floor(durationMs / 60_000);
  const days = Math.floor(totalMinutes / 1_440);
  const hours = Math.floor((totalMinutes % 1_440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function InvestigationLoadingState() {
  return (
    <div className="space-y-6 py-4" aria-label="Loading session investigation">
      <div className="space-y-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-52 w-full" />
    </div>
  );
}

function InvestigationSummary({ data }: { data: ActivityInvestigation }) {
  const summaryItems = [
    {
      icon: Clock3,
      label: "Duration",
      value: formatDuration(data.session.durationMs),
    },
    {
      icon: Network,
      label: "IP address",
      value: data.session.device.ipAddress || "Not recorded",
    },
    {
      icon: Laptop,
      label: "Device class",
      value: getActivityDeviceTypeLabel(data.session.device.deviceType),
    },
    {
      icon: Computer,
      label: "Platform",
      value: data.session.device.platform || "Not recorded",
    },
    {
      icon: Search,
      label: "Fingerprint",
      value: data.session.device.fingerprintHint || "Not recorded",
    },
  ];

  return (
    <section className="border-b border-border/70 pb-5" aria-labelledby="session-summary-heading">
      <h3 id="session-summary-heading" className="text-sm font-semibold text-foreground">
        Session summary
      </h3>
      <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {summaryItems.map(({ icon: Icon, label, value }) => (
          <div key={label} className="min-w-0 rounded-lg border border-border/70 bg-muted/20 p-3">
            <dt className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {label}
            </dt>
            <dd className="mt-1 truncate text-sm font-medium text-foreground" title={value}>
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Login</dt>
          <dd className="mt-1 text-foreground">
            {data.session.loginTime ? formatActivityTime(data.session.loginTime) : "Not recorded"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Last activity</dt>
          <dd className="mt-1 text-foreground">
            {data.session.lastActivityTime
              ? formatActivityTime(data.session.lastActivityTime)
              : "Not recorded"}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-xs text-muted-foreground">Browser</dt>
          <dd className="mt-1 break-words text-foreground">
            {data.session.device.browser || "Not recorded"}
          </dd>
        </div>
        {data.session.device.pcName ? (
          <div className="sm:col-span-2">
            <dt className="text-xs text-muted-foreground">Client-provided device label</dt>
            <dd className="mt-1 break-words text-foreground">
              {data.session.device.pcName}
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function InvestigationRisk({ data }: { data: ActivityInvestigation }) {
  const isCritical = data.security.riskLevel === "critical";
  const isAttention = data.security.riskLevel === "attention";
  const Icon = isCritical || isAttention ? ShieldAlert : ShieldCheck;
  const label = isCritical ? "Critical" : isAttention ? "Attention" : "Normal";

  return (
    <section className="border-b border-border/70 py-5" aria-labelledby="session-risk-heading">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="session-risk-heading" className="text-sm font-semibold text-foreground">
            Security assessment
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Signals describe recorded session state and do not independently prove malicious activity.
          </p>
        </div>
        <Badge variant={isCritical ? "destructive" : isAttention ? "secondary" : "outline"}>
          <Icon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          {label}
        </Badge>
      </div>
      <ul className="mt-3 divide-y divide-border/70 border-y border-border/70">
        {data.security.signals.map((signal) => (
          <li key={signal.code} className="flex items-start gap-3 py-3">
            <span
              className={
                signal.severity === "critical"
                  ? "mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-destructive"
                  : signal.severity === "attention"
                    ? "mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-600 dark:bg-amber-400"
                    : "mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary"
              }
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{signal.label}</span>
                <Badge variant="outline" className="text-2xs capitalize">
                  {signal.severity}
                </Badge>
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                {signal.description}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function InvestigationTimeline({ data }: { data: ActivityInvestigation }) {
  return (
    <section className="border-b border-border/70 py-5" aria-labelledby="session-timeline-heading">
      <h3 id="session-timeline-heading" className="text-sm font-semibold text-foreground">
        Session timeline
      </h3>
      <ol className="mt-4 space-y-0">
        {data.timeline.map((event, index) => (
          <li key={event.id} className="relative flex gap-3 pb-4 last:pb-0">
            {index < data.timeline.length - 1 ? (
              <span className="absolute left-[7px] top-4 h-full w-px bg-border" aria-hidden="true" />
            ) : null}
            <span className="relative mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-primary bg-background" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{event.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatActivityTime(event.timestamp)}
                {event.actor ? ` · ${event.actor}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function InvestigationAuditReferences({ data }: { data: ActivityInvestigation }) {
  return (
    <section className="py-5" aria-labelledby="session-audit-heading">
      <div className="flex items-center justify-between gap-3">
        <h3 id="session-audit-heading" className="text-sm font-semibold text-foreground">
          Audit references
        </h3>
        <Badge variant="outline">{data.auditEvents.length}</Badge>
      </div>
      {data.auditEvents.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">
          No session-linked audit event is available for this record.
        </p>
      ) : (
        <div className="mt-3 divide-y divide-border/70 border-y border-border/70">
          {data.auditEvents.map((event) => (
            <div key={event.id} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {event.action.replace(/_/g, " ")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {event.performedBy} · {formatActivityTime(event.timestamp)}
                  </p>
                </div>
                {event.requestId ? (
                  <code className="max-w-36 truncate text-2xs text-muted-foreground" title={event.requestId}>
                    {event.requestId}
                  </code>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function ActivityInvestigationDrawer({
  activity,
  actionLoading,
  onBan,
  onDelete,
  onKick,
  onOpenChange,
  open,
}: ActivityInvestigationDrawerProps) {
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const { data, error, loading, retry } = useActivityInvestigation(activity?.id ?? null, open);
  const actionDisabled = Boolean(activity && actionLoading === activity.id);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-hidden border-border/70 bg-background p-0 sm:max-w-xl"
        data-floating-ai-avoid="true"
        onOpenAutoFocus={() => {
          const trigger = findInvestigationTrigger(activity?.id);
          const activeElement = document.activeElement;
          returnFocusRef.current = trigger
            ?? (activeElement instanceof HTMLElement && activeElement !== document.body
              ? activeElement
              : null);
        }}
        onCloseAutoFocus={(event) => {
          const returnFocus = returnFocusRef.current
            ?? findInvestigationTrigger(activity?.id);
          returnFocusRef.current = null;
          if (!returnFocus || !document.contains(returnFocus)) {
            return;
          }
          event.preventDefault();
          returnFocus.focus();
        }}
      >
        <div className="flex h-full min-h-0 flex-col">
          <SheetHeader className="shrink-0 border-b border-border/70 px-5 py-5 pr-12 text-left sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <Activity className="h-4 w-4 text-primary" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-label-lg text-muted-foreground">
                Session investigation
              </span>
            </div>
            <SheetTitle className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 truncate">{activity?.username || "Activity session"}</span>
              {data ? getStatusBadge(data.session.status) : null}
            </SheetTitle>
            <SheetDescription>
              Review session facts, security signals, and exact audit references before taking action.
            </SheetDescription>
          </SheetHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-6">
            {loading ? <InvestigationLoadingState /> : null}
            {!loading && error ? (
              <Alert variant="destructive" className="my-5">
                <AlertTitle>Investigation unavailable</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>{error}</p>
                  <Button type="button" variant="outline" size="sm" onClick={retry}>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Try again
                  </Button>
                </AlertDescription>
              </Alert>
            ) : null}
            {!loading && data ? (
              <>
                <InvestigationSummary data={data} />
                <InvestigationRisk data={data} />
                <ActivityInvestigationRelatedSessions sessions={data.relatedSessions} />
                <InvestigationTimeline data={data} />
                <InvestigationAuditReferences data={data} />
              </>
            ) : null}
          </div>

          {activity && data ? (
            <SheetFooter className="shrink-0 gap-2 border-t border-border/70 bg-background px-5 py-4 sm:px-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => onDelete(activity)}
                disabled={actionDisabled}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete log
              </Button>
              {activity.isActive ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onKick(activity)}
                  disabled={actionDisabled}
                >
                  <UserX className="mr-2 h-4 w-4" />
                  Force logout
                </Button>
              ) : null}
              {activity.isActive && activity.role !== "superuser" ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => onBan(activity)}
                  disabled={actionDisabled}
                >
                  <Ban className="mr-2 h-4 w-4" />
                  Ban
                </Button>
              ) : null}
            </SheetFooter>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
