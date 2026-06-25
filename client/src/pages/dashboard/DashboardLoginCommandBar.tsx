import { memo, useMemo } from "react";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  DashboardAccessSignalTone,
  LoginTrend,
  RecentLoginActivity,
  SummaryData,
} from "@/pages/dashboard/types";
import {
  buildDashboardActionQueueItems,
  buildDashboardLoginHealthScore,
  buildDashboardLoginRiskInsights,
  resolveDashboardLoginRiskSummary,
} from "@/pages/dashboard/utils";

interface DashboardLoginCommandBarProps {
  loading: boolean;
  recentLoginActivities: RecentLoginActivity[] | undefined;
  summary: SummaryData | undefined;
  trends: LoginTrend[] | undefined;
}

const COMMAND_BAR_TONE_CLASS_BY_TONE: Record<DashboardAccessSignalTone, string> = {
  danger: "border-rose-500/50 bg-rose-500/10 text-rose-800 dark:text-rose-200",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  warning: "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200",
};

function DashboardLoginCommandBarSkeleton() {
  return (
    <section
      className="scroll-mt-24 rounded-2xl border border-border/60 bg-background p-3 shadow-sm sm:p-4"
      role="status"
      aria-label="Loading dashboard login command bar"
      data-floating-ai-avoid="true"
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <div key={index} className="rounded-xl border border-border/60 bg-muted/10 p-3" aria-hidden="true">
            <div className="h-3 w-20 animate-pulse rounded bg-slate-200/80 dark:bg-muted" />
            <div className="mt-3 h-5 w-24 animate-pulse rounded bg-slate-200/70 dark:bg-muted" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading dashboard login command bar</span>
    </section>
  );
}

function DashboardCommandMetric({
  icon: Icon,
  label,
  value,
  tone = "info",
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  tone?: DashboardAccessSignalTone;
}) {
  return (
    <article className={`min-w-0 rounded-xl border p-3 ${COMMAND_BAR_TONE_CLASS_BY_TONE[tone]}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="min-w-0 break-words text-xs font-semibold uppercase tracking-label-sm opacity-85">{label}</p>
      </div>
      <p className="mt-2 break-words text-lg font-bold leading-none">{value}</p>
    </article>
  );
}

function DashboardLoginCommandBarImpl({
  loading,
  recentLoginActivities,
  summary,
  trends,
}: DashboardLoginCommandBarProps) {
  const riskInsights = useMemo(
    () => buildDashboardLoginRiskInsights({ recentLoginActivities, summary, trends }),
    [recentLoginActivities, summary, trends],
  );
  const riskSummary = useMemo(() => resolveDashboardLoginRiskSummary(riskInsights), [riskInsights]);
  const healthScore = useMemo(() => buildDashboardLoginHealthScore(riskInsights), [riskInsights]);
  const nextAction = useMemo(
    () => buildDashboardActionQueueItems({ recentLoginActivities, summary, trends })[0] ?? null,
    [recentLoginActivities, summary, trends],
  );

  if (loading) {
    return <DashboardLoginCommandBarSkeleton />;
  }

  return (
    <section
      id="dashboard-login-priority"
      className="scroll-mt-24 rounded-2xl border border-border/60 bg-background p-3 shadow-sm sm:p-4"
      aria-label="Dashboard login priority command bar"
      data-floating-ai-avoid="true"
      data-testid="dashboard-login-command-bar"
    >
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-label-md text-muted-foreground">
              Priority Command Bar
            </p>
            <Badge
              variant={riskSummary.tone === "success" ? "secondary" : "outline"}
              className={`rounded-full ${riskSummary.tone === "success" ? "" : COMMAND_BAR_TONE_CLASS_BY_TONE[riskSummary.tone]}`}
              aria-label={`Login risk status ${riskSummary.label}`}
            >
              {riskSummary.label}
            </Badge>
          </div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {riskSummary.description}
          </p>
        </div>
        {nextAction ? (
          <a
            href={nextAction.targetHref}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:w-auto"
          >
            <span className="truncate">{nextAction.title}</span>
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </a>
        ) : (
          <div className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-semibold text-emerald-800 dark:text-emerald-200 xl:w-auto">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Tiada tindakan segera
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardCommandMetric
          icon={ShieldCheck}
          label="Health"
          value={`${healthScore.score}/100`}
          tone={healthScore.tone}
        />
        <DashboardCommandMetric
          icon={Activity}
          label="Sesi aktif"
          value={(summary?.activeSessions ?? 0).toLocaleString()}
          tone={(summary?.activeSessions ?? 0) > 0 ? "success" : "info"}
        />
        <DashboardCommandMetric
          icon={AlertTriangle}
          label="Gagal 24j"
          value={(summary?.loginFailures24h ?? 0).toLocaleString()}
          tone={(summary?.loginFailures24h ?? 0) >= 10 ? "danger" : (summary?.loginFailures24h ?? 0) > 0 ? "warning" : "success"}
        />
        <DashboardCommandMetric
          icon={Users}
          label="User"
          value={(summary?.totalUsers ?? 0).toLocaleString()}
          tone="info"
        />
      </div>
    </section>
  );
}

export const DashboardLoginCommandBar = memo(DashboardLoginCommandBarImpl);
