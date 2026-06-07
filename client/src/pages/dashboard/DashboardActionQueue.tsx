import { memo, useMemo } from "react";
import { ArrowRight, CheckCircle2, ClipboardList, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  DashboardActionQueueItem,
  DashboardActionQueuePriority,
  LoginTrend,
  RecentLoginActivity,
  SummaryData,
} from "@/pages/dashboard/types";
import { buildDashboardActionQueueItems } from "@/pages/dashboard/utils";

interface DashboardActionQueueProps {
  loading: boolean;
  recentLoginActivities: RecentLoginActivity[] | undefined;
  summary: SummaryData | undefined;
  trends: LoginTrend[] | undefined;
}

const PRIORITY_CLASS_BY_PRIORITY: Record<DashboardActionQueuePriority, string> = {
  high: "border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-200",
  low: "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-200",
  medium: "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200",
};

const PRIORITY_LABEL_BY_PRIORITY: Record<DashboardActionQueuePriority, string> = {
  high: "High",
  low: "Low",
  medium: "Medium",
};

function DashboardActionQueueSkeleton() {
  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading dashboard action queue">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="rounded-xl border border-border/60 bg-muted/10 p-3"
          aria-hidden="true"
        >
          <div className="h-3 w-20 animate-pulse rounded bg-slate-200/80 dark:bg-muted" />
          <div className="mt-3 h-5 w-36 animate-pulse rounded bg-slate-200/70 dark:bg-muted" />
          <div className="mt-2 h-10 animate-pulse rounded-lg bg-slate-200/60 dark:bg-muted" />
        </div>
      ))}
      <span className="sr-only">Loading dashboard action queue</span>
    </div>
  );
}

function DashboardActionQueueItemCard({ item, index }: { item: DashboardActionQueueItem; index: number }) {
  return (
    <article
      className="flex min-h-[180px] flex-col rounded-xl border border-border/60 bg-muted/10 p-3 shadow-sm"
      aria-label={`${PRIORITY_LABEL_BY_PRIORITY[item.priority]} priority action ${index + 1}: ${item.title}`}
    >
      <div className="flex items-start justify-between gap-3">
        <Badge variant="outline" className={`rounded-full ${PRIORITY_CLASS_BY_PRIORITY[item.priority]}`}>
          {PRIORITY_LABEL_BY_PRIORITY[item.priority]}
        </Badge>
        <ShieldAlert className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="mt-3 min-w-0 flex-1">
        <h3 className="text-sm font-semibold leading-5 text-foreground">{item.title}</h3>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{item.description}</p>
      </div>
      <Button asChild variant="outline" size="sm" className="mt-3 w-full justify-center rounded-lg">
        <a href={item.targetHref} data-testid={`link-dashboard-action-${item.id}`}>
          {item.actionLabel}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </Button>
    </article>
  );
}

function DashboardActionQueueImpl({
  loading,
  recentLoginActivities,
  summary,
  trends,
}: DashboardActionQueueProps) {
  const actionItems = useMemo(
    () => buildDashboardActionQueueItems({ recentLoginActivities, summary, trends }),
    [recentLoginActivities, summary, trends],
  );

  return (
    <Card
      className="rounded-2xl border border-border/60 bg-background shadow-sm"
      data-floating-ai-avoid="true"
      data-testid="card-dashboard-action-queue"
    >
      <CardHeader className="space-y-1 pb-2">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <ClipboardList className="h-5 w-5" aria-hidden="true" />
              Action Queue
            </CardTitle>
            <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
              Suggested review steps from current login, session, and account-risk signals.
            </p>
          </div>
          <Badge variant={actionItems.length > 0 ? "outline" : "secondary"} className="w-fit rounded-full">
            {loading ? "Checking" : actionItems.length > 0 ? `${actionItems.length} review items` : "Clear"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent aria-live="polite">
        {loading ? (
          <DashboardActionQueueSkeleton />
        ) : actionItems.length > 0 ? (
          <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-4" aria-label="Dashboard suggested action queue">
            {actionItems.map((item, index) => (
              <li key={item.id}>
                <DashboardActionQueueItemCard item={item} index={index} />
              </li>
            ))}
          </ol>
        ) : (
          <div className="flex min-h-[120px] flex-col justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-800 dark:text-emerald-200">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">No immediate review items</p>
                <p className="mt-1 text-xs leading-5">
                  Current login signals are within the expected range. Continue routine monitoring from the activity feed.
                </p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const DashboardActionQueue = memo(DashboardActionQueueImpl);
