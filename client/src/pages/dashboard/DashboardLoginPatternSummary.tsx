import { memo, useMemo } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Clock3, MonitorSmartphone, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  DashboardLoginPatternFact,
  DashboardLoginPatternFactId,
  DashboardLoginPatternTone,
  PeakHour,
  RecentLoginActivity,
  SummaryData,
  TopUser,
} from "@/pages/dashboard/types";
import { buildDashboardLoginPatternSummary } from "@/pages/dashboard/utils";

interface DashboardLoginPatternSummaryProps {
  loading: boolean;
  peakHours: PeakHour[] | undefined;
  recentLoginActivities: RecentLoginActivity[] | undefined;
  summary: SummaryData | undefined;
  topUsers: TopUser[] | undefined;
}

const PATTERN_TONE_CLASS_BY_TONE: Record<DashboardLoginPatternTone, string> = {
  danger: "border-rose-500/50 bg-rose-500/10 text-rose-800 dark:text-rose-200",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  warning: "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200",
};

const PATTERN_ICON_BY_ID: Record<DashboardLoginPatternFactId, typeof UserRound> = {
  "attention-reason": AlertTriangle,
  "common-browser": MonitorSmartphone,
  "peak-window": Clock3,
  "top-account": UserRound,
};

function DashboardLoginPatternSkeleton() {
  return (
    <div
      className="grid gap-2 md:grid-cols-2 xl:grid-cols-4"
      role="status"
      aria-label="Loading dashboard login pattern summary"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="min-h-[112px] rounded-xl border border-border/60 bg-muted/10 p-3"
          aria-hidden="true"
        >
          <div className="h-3 w-24 animate-pulse rounded bg-slate-200/80 dark:bg-muted" />
          <div className="mt-3 h-5 w-32 animate-pulse rounded bg-slate-200/70 dark:bg-muted" />
          <div className="mt-3 h-9 animate-pulse rounded-lg bg-slate-200/60 dark:bg-muted" />
        </div>
      ))}
      <span className="sr-only">Loading dashboard login pattern summary</span>
    </div>
  );
}

function DashboardLoginPatternFactTile({ fact }: { fact: DashboardLoginPatternFact }) {
  const Icon = PATTERN_ICON_BY_ID[fact.id];

  return (
    <article
      className={`min-h-[124px] rounded-xl border p-3 shadow-sm ${PATTERN_TONE_CLASS_BY_TONE[fact.tone]}`}
      aria-label={`${fact.label}: ${fact.value}. ${fact.description}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-xs font-semibold uppercase">{fact.label}</p>
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      </div>
      <p className="mt-2 truncate text-base font-bold leading-6" title={fact.value}>
        {fact.value}
      </p>
      <p className="mt-2 text-xs leading-5 opacity-90">{fact.description}</p>
    </article>
  );
}

function DashboardLoginPatternSummaryImpl({
  loading,
  peakHours,
  recentLoginActivities,
  summary,
  topUsers,
}: DashboardLoginPatternSummaryProps) {
  const patternSummary = useMemo(
    () => buildDashboardLoginPatternSummary({
      peakHours,
      recentLoginActivities,
      summary,
      topUsers,
    }),
    [peakHours, recentLoginActivities, summary, topUsers],
  );

  return (
    <Card
      className="rounded-2xl border border-border/60 bg-background shadow-sm"
      data-floating-ai-avoid="true"
      data-testid="card-dashboard-login-pattern-summary"
    >
      <CardHeader className="space-y-1 pb-2">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <BarChart3 className="h-5 w-5" aria-hidden="true" />
              Login Pattern Summary
            </CardTitle>
            <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
              Operator-friendly pattern notes from login activity, users, and peak-hour signals.
            </p>
          </div>
          <Badge
            variant={patternSummary.statusTone === "success" ? "secondary" : "outline"}
            className={`w-fit rounded-full ${patternSummary.statusTone === "success" ? "" : PATTERN_TONE_CLASS_BY_TONE[patternSummary.statusTone]}`}
          >
            {loading ? "Checking" : patternSummary.statusLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3" aria-live="polite">
        <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-sky-800 dark:text-sky-200" aria-hidden="true" />
            <p className="text-sm leading-6 text-foreground">{patternSummary.operatorNote}</p>
          </div>
        </div>
        {loading ? (
          <DashboardLoginPatternSkeleton />
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4" aria-label="Dashboard login pattern facts">
            {patternSummary.facts.map((fact) => (
              <DashboardLoginPatternFactTile key={fact.id} fact={fact} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const DashboardLoginPatternSummary = memo(DashboardLoginPatternSummaryImpl);
