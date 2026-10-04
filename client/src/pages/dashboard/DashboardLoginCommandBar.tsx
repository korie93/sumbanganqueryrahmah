import { memo, useMemo } from "react";
import { ArrowRight, CheckCircle2 } from "lucide-react";
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
      className="dashboard-command-status"
      role="status"
      aria-label="Loading dashboard login command bar"
      data-floating-ai-avoid="true"
    >
      <div className="flex flex-wrap gap-3" aria-hidden="true">
        <div className="h-5 w-24 animate-pulse rounded bg-muted" />
        <div className="h-5 w-48 animate-pulse rounded bg-muted" />
      </div>
      <span className="sr-only">Loading dashboard login command bar</span>
    </section>
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
      className="dashboard-command-status scroll-mt-24"
      aria-label="Dashboard login priority command bar"
      data-floating-ai-avoid="true"
      data-testid="dashboard-login-command-bar"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-label-md text-muted-foreground">
              Login status
            </p>
            <Badge
              variant={riskSummary.tone === "success" ? "secondary" : "outline"}
              className={`rounded-full ${riskSummary.tone === "success" ? "" : COMMAND_BAR_TONE_CLASS_BY_TONE[riskSummary.tone]}`}
              aria-label={`Login risk status ${riskSummary.label}`}
            >
              {riskSummary.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Health <span className="font-semibold text-foreground">{healthScore.score}/100</span>
            </span>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {riskSummary.description}
          </p>
        </div>
        {nextAction ? (
          <a
            href={nextAction.targetHref}
            className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-muted focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9"
          >
            <span className="truncate">{nextAction.title}</span>
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
          </a>
        ) : (
          <div className="inline-flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            Tiada tindakan segera
          </div>
        )}
      </div>
    </section>
  );
}

export const DashboardLoginCommandBar = memo(DashboardLoginCommandBarImpl);
