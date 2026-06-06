import { memo } from "react";
import { Clock, Globe2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardSectionError } from "@/pages/dashboard/DashboardSectionError";
import { buildDashboardRecentLoginActivityRowAriaLabel } from "@/pages/dashboard/dashboard-row-aria";
import type { RecentLoginActivity } from "@/pages/dashboard/types";
import {
  formatDashboardRecentLoginTime,
  resolveDashboardRecentLoginStatusMeta,
} from "@/pages/dashboard/utils";

interface DashboardRecentLoginActivityProps {
  activities: RecentLoginActivity[] | undefined;
  errorMessage: string | null;
  loading: boolean;
  onRetry: () => void;
  retrying: boolean;
}

function DashboardRecentLoginActivitySkeleton() {
  return (
    <div
      className="grid gap-3 lg:grid-cols-2"
      role="status"
      aria-label="Loading recent login activity"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="rounded-2xl border border-border/60 bg-muted/10 p-4"
          aria-hidden="true"
        >
          <div className="h-4 w-40 animate-pulse rounded bg-slate-200/80 dark:bg-muted" />
          <div className="mt-3 h-3 w-28 animate-pulse rounded bg-slate-200/70 dark:bg-muted" />
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="h-12 animate-pulse rounded-xl bg-slate-200/60 dark:bg-muted" />
            <div className="h-12 animate-pulse rounded-xl bg-slate-200/60 dark:bg-muted" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading recent login activity</span>
    </div>
  );
}

function DashboardRecentLoginActivityImpl({
  activities,
  errorMessage,
  loading,
  onRetry,
  retrying,
}: DashboardRecentLoginActivityProps) {
  const safeActivities = activities ?? [];

  return (
    <Card
      className="rounded-2xl border border-border/60 bg-background shadow-sm"
      data-floating-ai-avoid="true"
      data-testid="card-recent-login-activity"
    >
      <CardHeader className="space-y-1 pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <ShieldCheck className="h-5 w-5" />
              Recent Login Activity
            </CardTitle>
            <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
              Latest access events with masked network details for fast operator review.
            </p>
          </div>
          <Badge variant="outline" className="w-fit rounded-full">
            {safeActivities.length} recent
          </Badge>
        </div>
      </CardHeader>
      <CardContent aria-live="polite">
        {errorMessage ? (
          <DashboardSectionError
            title="Aktiviti login gagal dimuat"
            description={errorMessage}
            onRetry={onRetry}
            retrying={retrying}
            minHeightClassName="min-h-[260px]"
          />
        ) : loading ? (
          <DashboardRecentLoginActivitySkeleton />
        ) : safeActivities.length > 0 ? (
          <div
            className="grid max-h-[430px] gap-3 overflow-y-auto pr-1 lg:grid-cols-2"
            role="region"
            tabIndex={0}
            aria-label="Recent login activity list"
          >
            {safeActivities.map((activity, index) => {
              const statusMeta = resolveDashboardRecentLoginStatusMeta(activity.status);
              const formattedLoginTime = formatDashboardRecentLoginTime(activity.loginTime);
              const formattedLastActivityTime = formatDashboardRecentLoginTime(activity.lastActivityTime);
              const browser = activity.browser ?? "Unknown browser";
              const ipAddress = activity.ipAddress ?? "Unknown network";

              return (
                <article
                  key={`${activity.username}-${activity.loginTime ?? index}`}
                  role="group"
                  aria-label={buildDashboardRecentLoginActivityRowAriaLabel({
                    activity,
                    formattedLastActivityTime,
                    formattedLoginTime,
                    index: index + 1,
                    statusLabel: statusMeta.label,
                  })}
                  className="rounded-2xl border border-border/60 bg-muted/10 p-4 shadow-sm"
                  data-testid={`row-recent-login-activity-${index}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="break-words text-sm font-semibold text-foreground sm:text-base">
                        {activity.username}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge variant="outline" className="rounded-full text-2xs capitalize">
                          {activity.role}
                        </Badge>
                        <Badge variant="outline" className={`rounded-full text-2xs ${statusMeta.className}`}>
                          {statusMeta.label}
                        </Badge>
                      </div>
                    </div>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Clock className="h-4 w-4" aria-hidden="true" />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
                    <div className="rounded-xl border border-border/50 bg-background/60 p-3">
                      <p className="font-medium text-foreground">Login</p>
                      <p className="mt-1 leading-5">{formattedLoginTime}</p>
                    </div>
                    <div className="rounded-xl border border-border/50 bg-background/60 p-3">
                      <p className="font-medium text-foreground">Last activity</p>
                      <p className="mt-1 leading-5">{formattedLastActivityTime}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border/50 bg-background/60 p-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <span className="flex min-w-0 items-center gap-2">
                      <Globe2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="truncate" title={browser}>
                        {browser}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium text-foreground">{ipAddress}</span>
                  </div>

                  {activity.logoutReason ? (
                    <p className="mt-3 text-xs leading-5 text-muted-foreground">
                      Status note: <span className="text-foreground">{activity.logoutReason}</span>
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/10 px-4 text-center text-sm text-muted-foreground">
            No recent login activity is available yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const DashboardRecentLoginActivity = memo(DashboardRecentLoginActivityImpl);
