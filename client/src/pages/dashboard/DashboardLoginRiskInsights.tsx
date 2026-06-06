import { memo, useMemo } from "react";
import { Activity, AlertTriangle, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  DashboardAccessSignalTone,
  LoginTrend,
  RecentLoginActivity,
  SummaryData,
} from "@/pages/dashboard/types";
import {
  buildDashboardLoginRiskInsights,
  resolveDashboardLoginRiskSummary,
} from "@/pages/dashboard/utils";

interface DashboardLoginRiskInsightsProps {
  loading: boolean;
  recentLoginActivities: RecentLoginActivity[] | undefined;
  summary: SummaryData | undefined;
  trends: LoginTrend[] | undefined;
}

const TONE_CLASS_BY_TONE: Record<DashboardAccessSignalTone, string> = {
  danger: "border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warning: "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200",
};

const TONE_BAR_CLASS_BY_TONE: Record<DashboardAccessSignalTone, string> = {
  danger: "bg-rose-500",
  info: "bg-sky-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
};

function DashboardLoginRiskInsightsSkeleton() {
  return (
    <div
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      role="status"
      aria-label="Loading login risk insights"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-border/60 bg-muted/10 p-4"
          aria-hidden="true"
        >
          <div className="h-3 w-24 animate-pulse rounded bg-slate-200/80 dark:bg-muted" />
          <div className="mt-4 h-7 w-20 animate-pulse rounded bg-slate-200/70 dark:bg-muted" />
          <div className="mt-3 h-10 animate-pulse rounded-xl bg-slate-200/60 dark:bg-muted" />
        </div>
      ))}
      <span className="sr-only">Loading login risk insights</span>
    </div>
  );
}

function DashboardLoginRiskInsightsImpl({
  loading,
  recentLoginActivities,
  summary,
  trends,
}: DashboardLoginRiskInsightsProps) {
  const insights = useMemo(
    () => buildDashboardLoginRiskInsights({ recentLoginActivities, summary, trends }),
    [recentLoginActivities, summary, trends],
  );
  const riskSummary = useMemo(() => resolveDashboardLoginRiskSummary(insights), [insights]);

  return (
    <Card
      className="rounded-2xl border border-border/60 bg-background shadow-sm"
      data-floating-ai-avoid="true"
      data-testid="card-login-risk-insights"
    >
      <CardHeader className="space-y-1 pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <ShieldCheck className="h-5 w-5" />
              Login Risk Insights
            </CardTitle>
            <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
              Operator-ready signals derived from recent sessions, failed logins, and login trend shape.
            </p>
          </div>
          <Badge
            variant="outline"
            className={`w-fit rounded-full ${TONE_CLASS_BY_TONE[riskSummary.tone]}`}
            aria-label={`Login risk status ${riskSummary.label}`}
          >
            {riskSummary.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4" aria-live="polite">
        {loading ? (
          <DashboardLoginRiskInsightsSkeleton />
        ) : (
          <>
            <div className="rounded-2xl border border-border/60 bg-muted/10 p-4">
              <div className="flex items-start gap-3">
                <div className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${TONE_BAR_CLASS_BY_TONE[riskSummary.tone]}`} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{riskSummary.description}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Gunakan panel ini bersama rekod login terbaru sebelum tindakan sekat, reset, atau audit.
                  </p>
                </div>
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {insights.map((insight) => (
                <article
                  key={insight.title}
                  className="relative overflow-hidden rounded-2xl border border-border/60 bg-background p-4 shadow-sm"
                  role="group"
                  aria-label={`${insight.title}: ${insight.value}. ${insight.description}`}
                >
                  <div
                    className={`absolute inset-y-0 left-0 w-1 ${TONE_BAR_CLASS_BY_TONE[insight.tone]}`}
                    aria-hidden="true"
                  />
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-label-sm text-muted-foreground">
                        {insight.title}
                      </p>
                      <p className="mt-2 break-words text-2xl font-bold leading-none text-foreground">
                        {insight.value}
                      </p>
                    </div>
                    <div className={`rounded-full border p-2 ${TONE_CLASS_BY_TONE[insight.tone]}`}>
                      {insight.tone === "danger" || insight.tone === "warning" ? (
                        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Activity className="h-4 w-4" aria-hidden="true" />
                      )}
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-5 text-muted-foreground">{insight.description}</p>
                </article>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export const DashboardLoginRiskInsights = memo(DashboardLoginRiskInsightsImpl);
