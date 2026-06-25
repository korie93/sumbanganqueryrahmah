import { memo, useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, ArrowRight, CheckCircle2, ClipboardCheck, Gauge } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type {
  DashboardAccessSignalTone,
  DashboardActionQueueItem,
  DashboardLoginRiskInsight,
  LoginTrend,
  RecentLoginActivity,
  SummaryData,
} from "@/pages/dashboard/types";
import {
  buildDashboardActionQueueItems,
  buildDashboardLoginHealthScore,
  buildDashboardLoginRiskExplanation,
  buildDashboardLoginRiskInsights,
  resolveDashboardLoginRiskSummary,
} from "@/pages/dashboard/utils";

interface DashboardLoginSituationSummaryProps {
  loading: boolean;
  recentLoginActivities: RecentLoginActivity[] | undefined;
  summary: SummaryData | undefined;
  trends: LoginTrend[] | undefined;
}

interface DashboardLoginSituationFact {
  icon: LucideIcon;
  label: string;
  tone: DashboardAccessSignalTone;
  value: string;
}

interface DashboardLoginSituationSummaryContent {
  facts: DashboardLoginSituationFact[];
  headline: string;
  impact: string;
  nextAction: DashboardActionQueueItem | null;
  primarySignal: DashboardLoginRiskInsight;
  statusLabel: string;
  statusTone: DashboardAccessSignalTone;
}

const SITUATION_TONE_CLASS_BY_TONE: Record<DashboardAccessSignalTone, string> = {
  danger: "border-rose-500/50 bg-rose-500/10 text-rose-800 dark:text-rose-200",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  warning: "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200",
};

function getDashboardLoginSituationPrimarySignal(insights: readonly DashboardLoginRiskInsight[]) {
  return (
    insights.find((insight) => insight.tone === "danger")
    ?? insights.find((insight) => insight.tone === "warning")
    ?? insights[0]
  );
}

function getDashboardLoginSituationImpact(input: {
  recentLoginActivities?: readonly RecentLoginActivity[] | undefined;
  statusTone: DashboardAccessSignalTone;
  summary?: SummaryData | undefined;
}) {
  const failedLogins = input.summary?.loginFailures24h ?? 0;
  const activeSessions = input.summary?.activeSessions ?? 0;
  const recentRows = input.recentLoginActivities?.length ?? 0;

  if (input.statusTone === "danger") {
    return failedLogins > 0
      ? `${failedLogins.toLocaleString()} cubaan gagal boleh menjejaskan login pengguna sah jika pattern ini berulang.`
      : "Ada signal akses yang perlu disemak sebelum dianggap normal.";
  }

  if (input.statusTone === "warning") {
    return activeSessions > 0
      ? `${activeSessions.toLocaleString()} sesi aktif masih terkawal, tetapi wajar dipantau bersama rekod terbaru.`
      : "Signal kecil dikesan; pantau dahulu sebelum ambil tindakan pentadbiran.";
  }

  return recentRows > 0
    ? `${recentRows.toLocaleString()} rekod terbaru tersedia untuk audit rutin jika ada laporan pengguna.`
    : "Tiada impak pengguna yang jelas daripada signal login semasa.";
}

export function buildDashboardLoginSituationSummary(input: {
  recentLoginActivities?: readonly RecentLoginActivity[] | undefined;
  summary?: SummaryData | undefined;
  trends?: readonly LoginTrend[] | undefined;
}): DashboardLoginSituationSummaryContent {
  const { recentLoginActivities, summary, trends } = input;
  const insights = buildDashboardLoginRiskInsights({ recentLoginActivities, summary, trends });
  const riskSummary = resolveDashboardLoginRiskSummary(insights);
  const healthScore = buildDashboardLoginHealthScore(insights);
  const explanation = buildDashboardLoginRiskExplanation({ insights, summary: riskSummary });
  const primarySignal = getDashboardLoginSituationPrimarySignal(insights);
  const nextAction = buildDashboardActionQueueItems({ recentLoginActivities, summary, trends })[0] ?? null;
  const recentCount = recentLoginActivities?.length ?? 0;
  const trendCount = trends?.length ?? 0;

  return {
    facts: [
      {
        icon: Gauge,
        label: "Health score",
        tone: healthScore.tone,
        value: `${healthScore.score}/100`,
      },
      {
        icon: primarySignal.tone === "danger" || primarySignal.tone === "warning" ? AlertTriangle : CheckCircle2,
        label: "Signal utama",
        tone: primarySignal.tone,
        value: primarySignal.title,
      },
      {
        icon: ClipboardCheck,
        label: "Rekod terbaru",
        tone: recentCount > 0 ? "info" : "success",
        value: `${recentCount.toLocaleString()} rekod`,
      },
      {
        icon: Gauge,
        label: "Trend dibaca",
        tone: trendCount > 0 ? "info" : "success",
        value: `${trendCount.toLocaleString()} hari`,
      },
    ],
    headline: explanation.headline,
    impact: getDashboardLoginSituationImpact({
      recentLoginActivities,
      statusTone: riskSummary.tone,
      summary,
    }),
    nextAction,
    primarySignal,
    statusLabel: riskSummary.label,
    statusTone: riskSummary.tone,
  };
}

function DashboardLoginSituationSummarySkeleton() {
  return (
    <section
      className="scroll-mt-24 rounded-2xl border border-border/60 bg-background p-3 shadow-sm sm:p-4"
      role="status"
      aria-label="Loading dashboard login situation summary"
      data-floating-ai-avoid="true"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
        <div className="rounded-xl border border-border/60 bg-muted/10 p-3" aria-hidden="true">
          <div className="h-3 w-28 animate-pulse rounded bg-slate-200/80 dark:bg-muted" />
          <div className="mt-3 h-5 w-48 animate-pulse rounded bg-slate-200/70 dark:bg-muted" />
          <div className="mt-2 h-12 animate-pulse rounded-lg bg-slate-200/60 dark:bg-muted" />
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/10 p-3" aria-hidden="true">
          <div className="h-3 w-20 animate-pulse rounded bg-slate-200/80 dark:bg-muted" />
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-slate-200/60 dark:bg-muted" />
            ))}
          </div>
        </div>
      </div>
      <span className="sr-only">Loading dashboard login situation summary</span>
    </section>
  );
}

function DashboardLoginSituationSummaryImpl({
  loading,
  recentLoginActivities,
  summary,
  trends,
}: DashboardLoginSituationSummaryProps) {
  const situation = useMemo(
    () => buildDashboardLoginSituationSummary({ recentLoginActivities, summary, trends }),
    [recentLoginActivities, summary, trends],
  );

  if (loading) {
    return <DashboardLoginSituationSummarySkeleton />;
  }

  return (
    <section
      id="dashboard-login-situation-summary"
      className="scroll-mt-24 rounded-2xl border border-border/60 bg-background p-3 shadow-sm sm:p-4"
      aria-label="Dashboard login situation summary"
      data-floating-ai-avoid="true"
      data-testid="dashboard-login-situation-summary"
    >
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.55fr)]">
        <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-label-md text-muted-foreground">
                Situation Summary
              </p>
              <h2 className="mt-1 text-base font-semibold text-foreground">Ringkasan keputusan</h2>
            </div>
            <Badge
              variant={situation.statusTone === "success" ? "secondary" : "outline"}
              className={`w-fit rounded-full ${situation.statusTone === "success" ? "" : SITUATION_TONE_CLASS_BY_TONE[situation.statusTone]}`}
              aria-label={`Login situation status ${situation.statusLabel}`}
            >
              {situation.statusLabel}
            </Badge>
          </div>

          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            <div className="rounded-lg border border-border/60 bg-background p-3">
              <p className="text-xs font-semibold uppercase tracking-label-sm text-muted-foreground">Kenapa</p>
              <p className="mt-2 text-sm leading-6 text-foreground">{situation.headline}</p>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Signal utama: <span className="font-semibold text-foreground">{situation.primarySignal.title}</span>
                {" - "}
                {situation.primarySignal.description}
              </p>
            </div>

            <div className="rounded-lg border border-border/60 bg-background p-3">
              <p className="text-xs font-semibold uppercase tracking-label-sm text-muted-foreground">Impak user</p>
              <p className="mt-2 text-sm leading-6 text-foreground">{situation.impact}</p>
              {situation.nextAction ? (
                <a
                  href={situation.nextAction.targetHref}
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {situation.nextAction.title}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </a>
              ) : (
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-200">
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Teruskan pemantauan rutin
                </p>
              )}
            </div>
          </div>
        </div>

        <aside className="rounded-xl border border-border/60 bg-muted/10 p-3" aria-label="Situation summary facts">
          <p className="text-xs font-semibold uppercase tracking-label-md text-muted-foreground">Bukti ringkas</p>
          <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {situation.facts.map((fact) => {
              const Icon = fact.icon;

              return (
                <div key={fact.label} className={`rounded-lg border p-2 ${SITUATION_TONE_CLASS_BY_TONE[fact.tone]}`}>
                  <dt className="flex min-w-0 items-start gap-1.5 text-xxs font-semibold uppercase tracking-label-sm opacity-85">
                    <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words">{fact.label}</span>
                  </dt>
                  <dd className="mt-1 break-words text-sm font-bold text-current">{fact.value}</dd>
                </div>
              );
            })}
          </dl>
        </aside>
      </div>
    </section>
  );
}

export const DashboardLoginSituationSummary = memo(DashboardLoginSituationSummaryImpl);
