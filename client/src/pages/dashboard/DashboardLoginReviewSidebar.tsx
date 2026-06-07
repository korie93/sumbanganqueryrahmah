import { memo, useMemo } from "react";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardList,
  History,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  DashboardAccessSignalTone,
  DashboardActionQueuePriority,
  LoginTrend,
  PeakHour,
  RecentLoginActivity,
  SummaryData,
  TopUser,
} from "@/pages/dashboard/types";
import {
  buildDashboardActionQueueItems,
  buildDashboardLoginHealthScore,
  buildDashboardLoginPatternSummary,
  buildDashboardLoginRiskInsights,
  buildDashboardSessionHealthItems,
  resolveDashboardLoginRiskSummary,
} from "@/pages/dashboard/utils";

interface DashboardLoginReviewSidebarProps {
  loading: boolean;
  peakHours: PeakHour[] | undefined;
  recentLoginActivities: RecentLoginActivity[] | undefined;
  summary: SummaryData | undefined;
  topUsers: TopUser[] | undefined;
  trends: LoginTrend[] | undefined;
}

const SIDEBAR_TONE_CLASS_BY_TONE: Record<DashboardAccessSignalTone, string> = {
  danger: "border-rose-500/50 bg-rose-500/10 text-rose-800 dark:text-rose-200",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  warning: "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200",
};

const SIDEBAR_PRIORITY_CLASS_BY_PRIORITY: Record<DashboardActionQueuePriority, string> = {
  high: "border-rose-500/50 bg-rose-500/10 text-rose-800 dark:text-rose-200",
  low: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  medium: "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200",
};

const SIDEBAR_SHORTCUTS = [
  {
    href: "#dashboard-login-risk-insights",
    icon: ShieldCheck,
    label: "Risk insights",
  },
  {
    href: "#dashboard-recent-login-activity",
    icon: History,
    label: "Recent activity",
  },
  {
    href: "#dashboard-login-charts",
    icon: BarChart3,
    label: "Charts",
  },
] as const;

function DashboardLoginReviewSidebarSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading dashboard login sidebar">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="rounded-xl border border-border/60 bg-muted/10 p-3" aria-hidden="true">
          <div className="h-3 w-24 animate-pulse rounded bg-slate-200/80 dark:bg-muted" />
          <div className="mt-3 h-5 w-32 animate-pulse rounded bg-slate-200/70 dark:bg-muted" />
          <div className="mt-2 h-8 animate-pulse rounded-lg bg-slate-200/60 dark:bg-muted" />
        </div>
      ))}
      <span className="sr-only">Loading dashboard login sidebar</span>
    </div>
  );
}

function DashboardLoginReviewSidebarImpl({
  loading,
  peakHours,
  recentLoginActivities,
  summary,
  topUsers,
  trends,
}: DashboardLoginReviewSidebarProps) {
  const riskInsights = useMemo(
    () => buildDashboardLoginRiskInsights({ recentLoginActivities, summary, trends }),
    [recentLoginActivities, summary, trends],
  );
  const riskSummary = useMemo(() => resolveDashboardLoginRiskSummary(riskInsights), [riskInsights]);
  const healthScore = useMemo(() => buildDashboardLoginHealthScore(riskInsights), [riskInsights]);
  const actionItems = useMemo(
    () => buildDashboardActionQueueItems({ recentLoginActivities, summary, trends }).slice(0, 3),
    [recentLoginActivities, summary, trends],
  );
  const sessionHealthItems = useMemo(
    () => buildDashboardSessionHealthItems(recentLoginActivities),
    [recentLoginActivities],
  );
  const patternSummary = useMemo(
    () => buildDashboardLoginPatternSummary({ peakHours, recentLoginActivities, summary, topUsers }),
    [peakHours, recentLoginActivities, summary, topUsers],
  );
  const activeSessions = sessionHealthItems.find((item) => item.id === "active")?.value ?? 0;
  const staleSessions = sessionHealthItems.find((item) => item.id === "stale")?.value ?? 0;

  return (
    <Card
      className="rounded-2xl border border-border/60 bg-background shadow-sm"
      data-floating-ai-avoid="true"
      data-testid="card-dashboard-login-review-sidebar"
    >
      <CardHeader className="space-y-1 pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-5 w-5" aria-hidden="true" />
              Review Sidebar
            </CardTitle>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Ringkasan cepat supaya dashboard login tidak nampak berserabut.
            </p>
          </div>
          <Badge
            variant={riskSummary.tone === "success" ? "secondary" : "outline"}
            className={`w-fit rounded-full ${riskSummary.tone === "success" ? "" : SIDEBAR_TONE_CLASS_BY_TONE[riskSummary.tone]}`}
          >
            {loading ? "Checking" : riskSummary.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3" aria-live="polite">
        {loading ? (
          <DashboardLoginReviewSidebarSkeleton />
        ) : (
          <>
            <section className="rounded-xl border border-border/60 bg-muted/10 p-3" aria-label="Login review focus">
              <p className="text-xs font-semibold uppercase tracking-label-sm text-muted-foreground">Fokus semasa</p>
              <div className="mt-3 grid gap-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs leading-5 text-muted-foreground">Health score</span>
                  <Badge variant="outline" className={`rounded-full ${SIDEBAR_TONE_CLASS_BY_TONE[healthScore.tone]}`}>
                    {healthScore.score}/100
                  </Badge>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs leading-5 text-muted-foreground">Active sessions</span>
                  <span className="text-sm font-semibold text-foreground">{activeSessions.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs leading-5 text-muted-foreground">Stale sessions</span>
                  <span className="text-sm font-semibold text-foreground">{staleSessions.toLocaleString()}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs leading-5 text-muted-foreground">Pattern</span>
                  <Badge
                    variant={patternSummary.statusTone === "success" ? "secondary" : "outline"}
                    className={`rounded-full ${patternSummary.statusTone === "success" ? "" : SIDEBAR_TONE_CLASS_BY_TONE[patternSummary.statusTone]}`}
                  >
                    {patternSummary.statusLabel}
                  </Badge>
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-border/60 bg-background/80 p-3" aria-label="Sidebar action queue">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-label-sm text-muted-foreground">Tindakan</p>
                <Badge variant={actionItems.length > 0 ? "outline" : "secondary"} className="rounded-full">
                  {actionItems.length > 0 ? `${actionItems.length} item` : "Clear"}
                </Badge>
              </div>
              {actionItems.length > 0 ? (
                <ol className="mt-3 space-y-2">
                  {actionItems.map((item) => (
                    <li key={item.id} className="rounded-lg border border-border/60 bg-muted/10 p-2">
                      <Badge
                        variant="outline"
                        className={`rounded-full ${SIDEBAR_PRIORITY_CLASS_BY_PRIORITY[item.priority]}`}
                      >
                        {item.priority}
                      </Badge>
                      <p className="mt-2 text-xs font-semibold leading-5 text-foreground">{item.title}</p>
                      <a
                        href={item.targetHref}
                        className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {item.actionLabel}
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </a>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-800 dark:text-emerald-200">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <p className="text-xs leading-5">Tiada tindakan segera untuk login.</p>
                  </div>
                </div>
              )}
            </section>

            <nav
              className="rounded-xl border border-border/60 bg-muted/10 p-3"
              aria-label="Dashboard login section shortcuts"
            >
              <p className="text-xs font-semibold uppercase tracking-label-sm text-muted-foreground">Pergi ke</p>
              <div className="mt-3 grid gap-2">
                {SIDEBAR_SHORTCUTS.map((shortcut) => {
                  const Icon = shortcut.icon;
                  return (
                    <a
                      key={shortcut.href}
                      href={shortcut.href}
                      className="inline-flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="inline-flex min-w-0 items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span className="truncate">{shortcut.label}</span>
                      </span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </a>
                  );
                })}
              </div>
            </nav>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export const DashboardLoginReviewSidebar = memo(DashboardLoginReviewSidebarImpl);
