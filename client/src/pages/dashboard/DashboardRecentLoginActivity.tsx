import { memo, useMemo, useState } from "react";
import { Clock, Globe2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DashboardSectionError } from "@/pages/dashboard/DashboardSectionError";
import { buildDashboardRecentLoginActivityRowAriaLabel } from "@/pages/dashboard/dashboard-row-aria";
import type { RecentLoginActivity } from "@/pages/dashboard/types";
import {
  buildDashboardRecentLoginActivityFilterCounts,
  filterDashboardRecentLoginActivities,
  formatDashboardRecentLoginTime,
  type DashboardRecentLoginActivityFilter,
  resolveDashboardRecentLoginStatusMeta,
} from "@/pages/dashboard/utils";

interface DashboardRecentLoginActivityProps {
  activities: RecentLoginActivity[] | undefined;
  errorMessage: string | null;
  loading: boolean;
  onRetry: () => void;
  retrying: boolean;
}

const EMPTY_RECENT_LOGIN_ACTIVITIES: readonly RecentLoginActivity[] = [];
const RECENT_LOGIN_FILTER_OPTIONS: readonly {
  readonly id: DashboardRecentLoginActivityFilter;
  readonly label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "ended", label: "Ended" },
  { id: "attention", label: "Attention" },
];

function DashboardRecentLoginActivitySkeleton() {
  return (
    <div
      className="grid gap-2 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"
      role="status"
      aria-label="Loading recent login activity"
    >
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="rounded-xl border border-border/60 bg-muted/10 p-3"
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
  const [selectedFilter, setSelectedFilter] = useState<DashboardRecentLoginActivityFilter>("all");
  const safeActivities = activities ?? EMPTY_RECENT_LOGIN_ACTIVITIES;
  const filterCounts = useMemo(
    () => buildDashboardRecentLoginActivityFilterCounts(safeActivities),
    [safeActivities],
  );
  const visibleActivities = useMemo(
    () => filterDashboardRecentLoginActivities(safeActivities, selectedFilter),
    [safeActivities, selectedFilter],
  );
  const selectedFilterLabel =
    RECENT_LOGIN_FILTER_OPTIONS.find((option) => option.id === selectedFilter)?.label ?? "All";

  return (
    <Card
      className="rounded-2xl border border-border/60 bg-background shadow-sm"
      data-floating-ai-avoid="true"
      data-testid="card-recent-login-activity"
    >
      <CardHeader className="space-y-1 pb-2">
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
            {visibleActivities.length} shown
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
          <div className="space-y-3">
            <div
              className="grid grid-cols-2 gap-1 rounded-xl border border-border/60 bg-muted/15 p-1 sm:grid-cols-4"
              role="group"
              aria-label="Filter recent login activity"
            >
              {RECENT_LOGIN_FILTER_OPTIONS.map((option) => {
                const active = selectedFilter === option.id;
                return (
                  <Button
                    key={option.id}
                    type="button"
                    variant={active ? "default" : "ghost"}
                    size="sm"
                    className="h-8 justify-center rounded-lg px-2 text-xs"
                    onClick={() => setSelectedFilter(option.id)}
                    aria-pressed={active ? "true" : "false"}
                    aria-label={`Show ${option.label.toLowerCase()} login activity, ${filterCounts[option.id]} records`}
                    data-testid={`button-login-activity-filter-${option.id}`}
                  >
                    <span>{option.label}</span>
                    <span className="ml-1.5 rounded-full bg-background/80 px-1.5 py-0.5 text-2xs text-foreground">
                      {filterCounts[option.id]}
                    </span>
                  </Button>
                );
              })}
            </div>

            {visibleActivities.length > 0 ? (
              <div
                className="grid max-h-[360px] gap-2 overflow-y-auto pr-1 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"
                role="region"
                tabIndex={0}
                aria-label={`${selectedFilterLabel} recent login activity list`}
              >
                {visibleActivities.map((activity, index) => {
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
                      className="rounded-xl border border-border/60 bg-muted/10 p-3 shadow-sm"
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
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                          <Clock className="h-4 w-4" aria-hidden="true" />
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                        <div className="rounded-lg border border-border/50 bg-background/60 p-2.5">
                          <p className="font-medium text-foreground">Login</p>
                          <p className="mt-1 leading-5">{formattedLoginTime}</p>
                        </div>
                        <div className="rounded-lg border border-border/50 bg-background/60 p-2.5">
                          <p className="font-medium text-foreground">Last activity</p>
                          <p className="mt-1 leading-5">{formattedLastActivityTime}</p>
                        </div>
                      </div>

                      <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border/50 bg-background/60 p-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
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
              <div
                className="flex min-h-[180px] items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/10 px-4 text-center text-sm text-muted-foreground"
                role="status"
                aria-label={`${selectedFilterLabel} login activity filter is empty`}
              >
                No {selectedFilterLabel.toLowerCase()} login activity is available in the latest records.
              </div>
            )}
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
