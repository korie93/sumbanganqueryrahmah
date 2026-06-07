import { memo, useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Clock3, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  DashboardAccessSignalTone,
  DashboardActionQueuePriority,
  LoginTrend,
  RecentLoginActivity,
  SummaryData,
} from "@/pages/dashboard/types";
import {
  buildDashboardActionQueueItems,
  formatDashboardDate,
  formatDashboardRecentLoginTime,
  isDashboardRecentLoginAttentionActivity,
  resolveDashboardRecentLoginRiskNote,
} from "@/pages/dashboard/utils";

interface DashboardLoginIncidentTimelineProps {
  loading: boolean;
  recentLoginActivities: RecentLoginActivity[] | undefined;
  summary: SummaryData | undefined;
  trends: LoginTrend[] | undefined;
}

interface DashboardLoginIncidentTimelineItem {
  actionHref?: string;
  actionLabel?: string;
  description: string;
  icon: LucideIcon;
  id: string;
  timeLabel: string;
  title: string;
  tone: DashboardAccessSignalTone;
}

const TIMELINE_TONE_CLASS_BY_TONE: Record<DashboardAccessSignalTone, string> = {
  danger: "border-rose-500/50 bg-rose-500/10 text-rose-800 dark:text-rose-200",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  warning: "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200",
};

const TIMELINE_TONE_DOT_CLASS_BY_TONE: Record<DashboardAccessSignalTone, string> = {
  danger: "bg-rose-600 dark:bg-rose-300",
  info: "bg-sky-600 dark:bg-sky-300",
  success: "bg-emerald-600 dark:bg-emerald-300",
  warning: "bg-amber-700 dark:bg-amber-300",
};

const TIMELINE_PRIORITY_TONE_BY_PRIORITY: Record<DashboardActionQueuePriority, DashboardAccessSignalTone> = {
  high: "danger",
  low: "info",
  medium: "warning",
};

function parseDashboardIncidentTimeMs(value: string | null | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getDashboardActivitySortTimeMs(activity: RecentLoginActivity) {
  return Math.max(
    parseDashboardIncidentTimeMs(activity.lastActivityTime) ?? 0,
    parseDashboardIncidentTimeMs(activity.logoutTime) ?? 0,
    parseDashboardIncidentTimeMs(activity.loginTime) ?? 0,
  );
}

function getLatestDashboardTrend(trends: readonly LoginTrend[] | undefined) {
  if (!trends?.length) {
    return null;
  }

  return trends[trends.length - 1] ?? null;
}

function hasDashboardLoginSpike(trends: readonly LoginTrend[] | undefined) {
  if (!trends || trends.length < 2) {
    return false;
  }

  const latest = trends[trends.length - 1]?.logins ?? 0;
  const previous = trends.slice(0, -1).map((trend) => trend.logins);
  const previousAverage =
    previous.length > 0 ? previous.reduce((total, value) => total + value, 0) / previous.length : latest;
  const spikeThreshold = Math.max(3, previousAverage * 1.5);

  return latest >= spikeThreshold && latest > previousAverage;
}

export function buildDashboardLoginIncidentTimelineItems(input: {
  recentLoginActivities?: readonly RecentLoginActivity[] | undefined;
  summary?: SummaryData | undefined;
  trends?: readonly LoginTrend[] | undefined;
}): DashboardLoginIncidentTimelineItem[] {
  const { recentLoginActivities, summary, trends } = input;
  const activities = recentLoginActivities ?? [];
  const items: DashboardLoginIncidentTimelineItem[] = [];
  const attentionActivity = [...activities]
    .filter(isDashboardRecentLoginAttentionActivity)
    .sort((left, right) => getDashboardActivitySortTimeMs(right) - getDashboardActivitySortTimeMs(left))[0];

  if (attentionActivity) {
    const note = resolveDashboardRecentLoginRiskNote(attentionActivity);
    const eventTime =
      attentionActivity.lastActivityTime ?? attentionActivity.logoutTime ?? attentionActivity.loginTime;

    items.push({
      actionHref: "/monitor?section=activity",
      actionLabel: "Open activity",
      description: `${attentionActivity.username} (${attentionActivity.role}) - ${note.description}`,
      icon: ShieldAlert,
      id: "attention-activity",
      timeLabel: formatDashboardRecentLoginTime(eventTime),
      title: note.label,
      tone: note.tone,
    });
  }

  const failedLogins = summary?.loginFailures24h ?? 0;
  if (failedLogins > 0) {
    items.push({
      actionHref: "/monitor?section=activity",
      actionLabel: "Semak gagal login",
      description: `${failedLogins.toLocaleString()} cubaan gagal dalam 24 jam. Utamakan semakan jika berulang pada akaun sama.`,
      icon: AlertTriangle,
      id: "failed-login-pressure",
      timeLabel: "24j",
      title: "Failed login pressure",
      tone: failedLogins >= 10 ? "danger" : "warning",
    });
  }

  const activeSessions = summary?.activeSessions ?? 0;
  if (activeSessions > 0) {
    const totalUsers = summary?.totalUsers ?? 0;
    const activeRatio = totalUsers > 0 ? activeSessions / totalUsers : 0;
    items.push({
      description: totalUsers > 0
        ? `${activeSessions.toLocaleString()} daripada ${totalUsers.toLocaleString()} pengguna ada sesi aktif.`
        : `${activeSessions.toLocaleString()} sesi aktif sedang direkod.`,
      icon: Activity,
      id: "active-session-load",
      timeLabel: "Live",
      title: "Sesi aktif sekarang",
      tone: activeRatio >= 0.75 ? "warning" : "success",
    });
  }

  const latestTrend = getLatestDashboardTrend(trends);
  if (latestTrend && latestTrend.logins > 0) {
    const hasSpike = hasDashboardLoginSpike(trends);
    items.push({
      description: `${latestTrend.logins.toLocaleString()} login dan ${latestTrend.logouts.toLocaleString()} logout pada hari terkini.`,
      icon: Clock3,
      id: "latest-login-trend",
      timeLabel: formatDashboardDate(latestTrend.date),
      title: hasSpike ? "Trend login meningkat" : "Trend login terkini",
      tone: hasSpike ? "warning" : "info",
    });
  }

  const nextAction = buildDashboardActionQueueItems({ recentLoginActivities, summary, trends })[0];
  if (nextAction) {
    items.push({
      actionHref: nextAction.targetHref,
      actionLabel: nextAction.actionLabel,
      description: nextAction.description,
      icon: ArrowRight,
      id: "next-action",
      timeLabel: "Next",
      title: nextAction.title,
      tone: TIMELINE_PRIORITY_TONE_BY_PRIORITY[nextAction.priority],
    });
  }

  if (items.length === 0) {
    return [
      {
        description: "Tiada incident login utama dikesan daripada data semasa.",
        icon: CheckCircle2,
        id: "normal-state",
        timeLabel: "Now",
        title: "Status login normal",
        tone: "success",
      },
    ];
  }

  return items.slice(0, 4);
}

function DashboardLoginIncidentTimelineSkeleton() {
  return (
    <section
      className="rounded-2xl border border-border/60 bg-background p-3 shadow-sm sm:p-4"
      role="status"
      aria-label="Loading dashboard login incident timeline"
      data-floating-ai-avoid="true"
    >
      <div className="grid gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-xl border border-border/60 bg-muted/10 p-3" aria-hidden="true">
            <div className="h-3 w-16 animate-pulse rounded bg-slate-200/80 dark:bg-muted" />
            <div className="mt-3 h-4 w-28 animate-pulse rounded bg-slate-200/70 dark:bg-muted" />
            <div className="mt-2 h-8 animate-pulse rounded bg-slate-200/60 dark:bg-muted" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading dashboard login incident timeline</span>
    </section>
  );
}

function DashboardLoginIncidentTimelineImpl({
  loading,
  recentLoginActivities,
  summary,
  trends,
}: DashboardLoginIncidentTimelineProps) {
  const timelineItems = useMemo(
    () => buildDashboardLoginIncidentTimelineItems({ recentLoginActivities, summary, trends }),
    [recentLoginActivities, summary, trends],
  );

  if (loading) {
    return <DashboardLoginIncidentTimelineSkeleton />;
  }

  return (
    <section
      className="rounded-2xl border border-border/60 bg-background p-3 shadow-sm sm:p-4"
      aria-label="Dashboard login incident timeline"
      data-floating-ai-avoid="true"
      data-testid="dashboard-login-incident-timeline"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-label-md text-muted-foreground">
            Incident Timeline
          </p>
          <h2 className="mt-1 text-base font-semibold text-foreground">Apa yang berlaku sekarang</h2>
        </div>
        <p className="text-xs leading-5 text-muted-foreground sm:max-w-md sm:text-right">
          Urutan ringkas supaya operator tahu signal mana perlu dibaca dahulu.
        </p>
      </div>

      <ol className="mt-4 grid gap-3 lg:grid-cols-4" aria-label="Login incident sequence">
        {timelineItems.map((item, index) => {
          const Icon = item.icon;

          return (
            <li
              key={item.id}
              className="relative rounded-xl border border-border/60 bg-muted/10 p-3"
              data-testid={`dashboard-login-timeline-item-${item.id}`}
            >
              <div className="flex items-center justify-between gap-3">
                <Badge variant="outline" className={`rounded-full ${TIMELINE_TONE_CLASS_BY_TONE[item.tone]}`}>
                  {item.timeLabel}
                </Badge>
                <span
                  className={`h-2.5 w-2.5 rounded-full ${TIMELINE_TONE_DOT_CLASS_BY_TONE[item.tone]}`}
                  aria-hidden="true"
                />
              </div>
              <div className="mt-3 flex items-start gap-2">
                <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-5 text-foreground">
                    {index + 1}. {item.title}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.description}</p>
                  {item.actionHref && item.actionLabel ? (
                    <a
                      href={item.actionHref}
                      className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {item.actionLabel}
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export const DashboardLoginIncidentTimeline = memo(DashboardLoginIncidentTimelineImpl);
