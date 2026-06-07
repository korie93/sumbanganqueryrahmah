import { memo, useMemo } from "react";
import { Activity, CheckCircle2, Clock3, Hourglass, TimerReset } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  DashboardSessionHealthItem,
  DashboardSessionHealthItemId,
  DashboardSessionHealthTone,
  RecentLoginActivity,
} from "@/pages/dashboard/types";
import { buildDashboardSessionHealthItems } from "@/pages/dashboard/utils";

interface DashboardSessionHealthStripProps {
  loading: boolean;
  recentLoginActivities: RecentLoginActivity[] | undefined;
}

const HEALTH_TONE_CLASS_BY_TONE: Record<DashboardSessionHealthTone, string> = {
  danger: "border-rose-500/50 bg-rose-500/10 text-rose-800 dark:text-rose-200",
  info: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  warning: "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200",
};

const HEALTH_ICON_BY_ID: Record<DashboardSessionHealthItemId, typeof Activity> = {
  active: Activity,
  fresh: CheckCircle2,
  "idle-watch": Clock3,
  stale: Hourglass,
  "timeout-ended": TimerReset,
};

function DashboardSessionHealthSkeleton() {
  return (
    <div
      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
      role="status"
      aria-label="Loading dashboard session health"
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className="min-h-[104px] rounded-xl border border-border/60 bg-muted/10 p-3"
          aria-hidden="true"
        >
          <div className="h-3 w-20 animate-pulse rounded bg-slate-200/80 dark:bg-muted" />
          <div className="mt-3 h-7 w-12 animate-pulse rounded bg-slate-200/70 dark:bg-muted" />
          <div className="mt-3 h-8 animate-pulse rounded-lg bg-slate-200/60 dark:bg-muted" />
        </div>
      ))}
      <span className="sr-only">Loading dashboard session health</span>
    </div>
  );
}

function DashboardSessionHealthTile({ item }: { item: DashboardSessionHealthItem }) {
  const Icon = HEALTH_ICON_BY_ID[item.id];

  return (
    <article
      className={`min-h-[112px] rounded-xl border p-3 shadow-sm ${HEALTH_TONE_CLASS_BY_TONE[item.tone]}`}
      aria-label={`${item.label}: ${item.value}. ${item.description}`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-xs font-semibold uppercase">{item.label}</p>
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      </div>
      <p className="mt-2 text-2xl font-bold leading-none">{item.value.toLocaleString()}</p>
      <p className="mt-2 text-xs leading-5 opacity-90">{item.description}</p>
    </article>
  );
}

function DashboardSessionHealthStripImpl({
  loading,
  recentLoginActivities,
}: DashboardSessionHealthStripProps) {
  const healthItems = useMemo(
    () => buildDashboardSessionHealthItems(recentLoginActivities),
    [recentLoginActivities],
  );
  const staleItem = healthItems.find((item) => item.id === "stale");
  const idleWatchItem = healthItems.find((item) => item.id === "idle-watch");
  const needsReview = (staleItem?.value ?? 0) > 0 || (idleWatchItem?.value ?? 0) > 0;

  return (
    <Card
      className="rounded-2xl border border-border/60 bg-background shadow-sm"
      data-floating-ai-avoid="true"
      data-testid="card-dashboard-session-health"
    >
      <CardHeader className="space-y-1 pb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Activity className="h-5 w-5" aria-hidden="true" />
              Session Health
            </CardTitle>
            <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
              Active-session freshness grouped from the latest login activity records.
            </p>
          </div>
          <Badge variant={needsReview ? "outline" : "secondary"} className="w-fit rounded-full">
            {loading ? "Checking" : needsReview ? "Needs review" : "Healthy"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent aria-live="polite">
        {loading ? (
          <DashboardSessionHealthSkeleton />
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="Dashboard session health summary">
            {healthItems.map((item) => (
              <DashboardSessionHealthTile key={item.id} item={item} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const DashboardSessionHealthStrip = memo(DashboardSessionHealthStripImpl);
