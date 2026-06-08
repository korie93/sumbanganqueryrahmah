import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Clock, Eye, Globe2, ShieldCheck, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DashboardSectionError } from "@/pages/dashboard/DashboardSectionError";
import { buildDashboardRecentLoginActivityRowAriaLabel } from "@/pages/dashboard/dashboard-row-aria";
import type { RecentLoginActivity } from "@/pages/dashboard/types";
import {
  buildDashboardRecentLoginActivityFilterCounts,
  filterDashboardRecentLoginActivities,
  formatDashboardRecentLoginTime,
  resolveDashboardRecentLoginRiskNote,
  type DashboardRecentLoginActivityFilter,
  resolveDashboardRecentLoginStatusMeta,
} from "@/pages/dashboard/utils";

interface DashboardRecentLoginActivityProps {
  activities: RecentLoginActivity[] | undefined;
  cleaningEndedActivityLogs?: boolean | undefined;
  deletingActivityId?: string | null | undefined;
  errorMessage: string | null;
  loading: boolean;
  onCleanupEndedActivities?: (() => void) | undefined;
  onDeleteEndedActivity?: ((activity: RecentLoginActivity) => void) | undefined;
  onRetry: () => void;
  retrying: boolean;
}

const EMPTY_RECENT_LOGIN_ACTIVITIES: readonly RecentLoginActivity[] = [];
const RECENT_LOGIN_ACTIVITY_CLEANUP_DAYS = 30;
const RECENT_LOGIN_ACTIVITY_CLEANUP_LIMIT = 500;
const RECENT_LOGIN_ACTIVITY_PAGE_SIZE = 4;
const RECENT_LOGIN_FILTER_OPTIONS: readonly {
  readonly id: DashboardRecentLoginActivityFilter;
  readonly label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "ended", label: "Ended" },
  { id: "attention", label: "Attention" },
];

const RISK_NOTE_CLASS_BY_TONE = {
  info: "border-blue-500/40 bg-blue-500/10 text-blue-800 dark:text-blue-200",
  success: "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200",
  warning: "border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200",
} as const;

function DetailBlock({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
      <p className="text-2xs font-semibold uppercase tracking-label-md text-muted-foreground">{label}</p>
      <div className="mt-1.5 break-words text-sm text-foreground">{children}</div>
    </div>
  );
}

function DashboardRecentLoginActivityDetailSheet({
  activity,
  onOpenChange,
}: {
  activity: RecentLoginActivity | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = activity !== null;
  const statusMeta = activity ? resolveDashboardRecentLoginStatusMeta(activity.status) : null;
  const riskNote = activity ? resolveDashboardRecentLoginRiskNote(activity) : null;
  const formattedLoginTime = activity ? formatDashboardRecentLoginTime(activity.loginTime) : "Unknown";
  const formattedLastActivityTime = activity ? formatDashboardRecentLoginTime(activity.lastActivityTime) : "Unknown";
  const formattedLogoutTime = activity ? formatDashboardRecentLoginTime(activity.logoutTime) : "Unknown";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[min(94vw,34rem)] overflow-y-auto sm:max-w-xl"
        data-testid="recent-login-activity-detail-sheet"
      >
        {activity && statusMeta && riskNote ? (
          <div className="space-y-5 pr-1">
            <SheetHeader className="pr-8">
              <SheetTitle>Login Activity Detail</SheetTitle>
              <SheetDescription>
                Semak konteks sesi, masa akses, dan nota risiko tanpa memaparkan token atau session ID.
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="rounded-full capitalize">
                {activity.role}
              </Badge>
              <Badge variant="outline" className={`rounded-full ${statusMeta.className}`}>
                {statusMeta.label}
              </Badge>
              <Badge variant="outline" className={`rounded-full ${RISK_NOTE_CLASS_BY_TONE[riskNote.tone]}`}>
                {riskNote.label}
              </Badge>
            </div>

            <section
              className={`rounded-xl border p-3 ${RISK_NOTE_CLASS_BY_TONE[riskNote.tone]}`}
              aria-label={`Risk note: ${riskNote.label}`}
            >
              <p className="text-sm font-semibold">{riskNote.label}</p>
              <p className="mt-1 text-xs leading-5">{riskNote.description}</p>
            </section>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailBlock label="Username">{activity.username}</DetailBlock>
              <DetailBlock label="Role">{activity.role}</DetailBlock>
              <DetailBlock label="Login time">{formattedLoginTime}</DetailBlock>
              <DetailBlock label="Last activity">{formattedLastActivityTime}</DetailBlock>
              <DetailBlock label="Logout time">{formattedLogoutTime}</DetailBlock>
              <DetailBlock label="Status">{statusMeta.label}</DetailBlock>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <DetailBlock label="Browser">{activity.browser ?? "Unknown browser"}</DetailBlock>
              <DetailBlock label="Network">{activity.ipAddress ?? "Unknown network"}</DetailBlock>
            </div>

            <DetailBlock label="Status note">{activity.logoutReason || "No logout reason recorded."}</DetailBlock>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

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
  cleaningEndedActivityLogs = false,
  deletingActivityId = null,
  errorMessage,
  loading,
  onCleanupEndedActivities,
  onDeleteEndedActivity,
  onRetry,
  retrying,
}: DashboardRecentLoginActivityProps) {
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<DashboardRecentLoginActivityFilter>("all");
  const [selectedPage, setSelectedPage] = useState(1);
  const [selectedActivity, setSelectedActivity] = useState<RecentLoginActivity | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<RecentLoginActivity | null>(null);
  const safeActivities = activities ?? EMPTY_RECENT_LOGIN_ACTIVITIES;
  const filterCounts = useMemo(
    () => buildDashboardRecentLoginActivityFilterCounts(safeActivities),
    [safeActivities],
  );
  const visibleActivities = useMemo(
    () => filterDashboardRecentLoginActivities(safeActivities, selectedFilter),
    [safeActivities, selectedFilter],
  );
  const totalPages = Math.max(1, Math.ceil(visibleActivities.length / RECENT_LOGIN_ACTIVITY_PAGE_SIZE));
  const activePage = Math.min(selectedPage, totalPages);
  const pageStartIndex = (activePage - 1) * RECENT_LOGIN_ACTIVITY_PAGE_SIZE;
  const pageEndIndex = Math.min(pageStartIndex + RECENT_LOGIN_ACTIVITY_PAGE_SIZE, visibleActivities.length);
  const pagedActivities = useMemo(
    () => visibleActivities.slice(pageStartIndex, pageEndIndex),
    [pageEndIndex, pageStartIndex, visibleActivities],
  );
  const shownStart = visibleActivities.length > 0 ? pageStartIndex + 1 : 0;
  const shownEnd = visibleActivities.length > 0 ? pageEndIndex : 0;
  const selectedFilterLabel =
    RECENT_LOGIN_FILTER_OPTIONS.find((option) => option.id === selectedFilter)?.label ?? "All";
  const handleFilterSelect = useCallback((filter: DashboardRecentLoginActivityFilter) => {
    setSelectedFilter(filter);
    setSelectedPage(1);
  }, []);
  const handlePreviousPage = useCallback(() => {
    setSelectedPage((page) => Math.max(1, page - 1));
  }, []);
  const handleNextPage = useCallback(() => {
    setSelectedPage((page) => Math.min(totalPages, page + 1));
  }, [totalPages]);
  const handleDetailSheetOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setSelectedActivity(null);
    }
  }, []);
  const handleDeleteDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setDeleteCandidate(null);
    }
  }, []);
  const handleConfirmCleanup = useCallback(() => {
    if (onCleanupEndedActivities) {
      onCleanupEndedActivities();
    }
    setCleanupDialogOpen(false);
  }, [onCleanupEndedActivities]);
  const handleConfirmDelete = useCallback(() => {
    if (deleteCandidate && onDeleteEndedActivity) {
      onDeleteEndedActivity(deleteCandidate);
    }
    setDeleteCandidate(null);
  }, [deleteCandidate, onDeleteEndedActivity]);

  return (
    <>
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
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="w-fit rounded-full">
                {visibleActivities.length} shown
              </Badge>
              {onCleanupEndedActivities ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full border-destructive/40 px-3 text-xs text-destructive hover:bg-destructive/10"
                  onClick={() => setCleanupDialogOpen(true)}
                  disabled={cleaningEndedActivityLogs}
                  aria-label={`Clean up ended login activity logs older than ${RECENT_LOGIN_ACTIVITY_CLEANUP_DAYS} days`}
                  data-testid="button-recent-login-cleanup-ended"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                  {cleaningEndedActivityLogs ? "Cleaning..." : "Cleanup old logs"}
                </Button>
              ) : null}
            </div>
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
                      onClick={() => handleFilterSelect(option.id)}
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
                <>
                  <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/10 p-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      Showing {shownStart}-{shownEnd} of {visibleActivities.length}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg px-2"
                        onClick={handlePreviousPage}
                        disabled={activePage <= 1}
                        aria-label="Show previous recent login activity page"
                        data-testid="button-login-activity-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                        Prev
                      </Button>
                      <span className="min-w-12 text-center font-medium text-foreground">
                        {activePage}/{totalPages}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 rounded-lg px-2"
                        onClick={handleNextPage}
                        disabled={activePage >= totalPages}
                        aria-label="Show next recent login activity page"
                        data-testid="button-login-activity-next-page"
                      >
                        Next
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                  <div
                    className="grid max-h-[360px] gap-2 overflow-y-auto pr-1 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"
                    role="region"
                    tabIndex={0}
                    aria-label={`${selectedFilterLabel} recent login activity list`}
                  >
                    {pagedActivities.map((activity, index) => {
                      const statusMeta = resolveDashboardRecentLoginStatusMeta(activity.status);
                      const formattedLoginTime = formatDashboardRecentLoginTime(activity.loginTime);
                      const formattedLastActivityTime = formatDashboardRecentLoginTime(activity.lastActivityTime);
                      const browser = activity.browser ?? "Unknown browser";
                      const ipAddress = activity.ipAddress ?? "Unknown network";
                      const absoluteIndex = pageStartIndex + index;
                      const canDeleteActivity = Boolean(activity.id && activity.status === "ended" && onDeleteEndedActivity);
                      const isDeletingActivity = Boolean(activity.id && activity.id === deletingActivityId);

                      return (
                        <article
                          key={activity.id ?? `${activity.username}-${activity.loginTime ?? absoluteIndex}`}
                          role="group"
                          aria-label={buildDashboardRecentLoginActivityRowAriaLabel({
                            activity,
                            formattedLastActivityTime,
                            formattedLoginTime,
                            index: absoluteIndex + 1,
                            statusLabel: statusMeta.label,
                          })}
                          className="rounded-xl border border-border/60 bg-muted/10 p-3 shadow-sm"
                          data-testid={`row-recent-login-activity-${absoluteIndex}`}
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

                          <div className={canDeleteActivity ? "mt-3 grid gap-2 sm:grid-cols-2" : "mt-3"}>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="w-full justify-center rounded-lg"
                              onClick={() => setSelectedActivity(activity)}
                              aria-label={`Open login activity details for ${activity.username}`}
                              data-testid={`button-recent-login-details-${absoluteIndex}`}
                            >
                              <Eye className="mr-2 h-4 w-4" aria-hidden="true" />
                              Details
                            </Button>
                            {canDeleteActivity ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="w-full justify-center rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleteCandidate(activity)}
                                disabled={isDeletingActivity}
                                aria-label={`Delete ended login activity log for ${activity.username}`}
                                data-testid={`button-recent-login-delete-${absoluteIndex}`}
                              >
                                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                                {isDeletingActivity ? "Deleting..." : "Delete log"}
                              </Button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </>
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
      <DashboardRecentLoginActivityDetailSheet
        activity={selectedActivity}
        onOpenChange={handleDetailSheetOpenChange}
      />
      <AlertDialog open={deleteCandidate !== null} onOpenChange={handleDeleteDialogOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete ended login log?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the ended activity record for {deleteCandidate?.username ?? "this user"} from the activity log.
              Active sessions are not deleted from this dashboard action.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="border border-destructive-border bg-destructive text-destructive-foreground"
              onClick={handleConfirmDelete}
            >
              Delete ended log
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={cleanupDialogOpen} onOpenChange={setCleanupDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clean up old ended login logs?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes up to {RECENT_LOGIN_ACTIVITY_CLEANUP_LIMIT} ended login activity records older than{" "}
              {RECENT_LOGIN_ACTIVITY_CLEANUP_DAYS} days. Active sessions are never deleted by this cleanup.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="border border-destructive-border bg-destructive text-destructive-foreground"
              onClick={handleConfirmCleanup}
            >
              Clean up ended logs
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export const DashboardRecentLoginActivity = memo(DashboardRecentLoginActivityImpl);
