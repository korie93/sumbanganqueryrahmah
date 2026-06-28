import { memo, useCallback, useRef, useState, type ReactNode } from "react";
import { CalendarDays, Clock, Eye, Globe2, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { AppPaginationBar } from "@/components/data/AppPaginationBar";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DashboardSectionError } from "@/pages/dashboard/DashboardSectionError";
import { buildDashboardRecentLoginActivityRowAriaLabel } from "@/pages/dashboard/dashboard-row-aria";
import type {
  RecentLoginActivity,
  RecentLoginActivityFilter,
} from "@/pages/dashboard/types";
import {
  formatDashboardRecentLoginTime,
  resolveDashboardRecentLoginRiskNote,
  resolveDashboardRecentLoginStatusMeta,
} from "@/pages/dashboard/utils";

interface DashboardRecentLoginActivityProps {
  activities: RecentLoginActivity[] | undefined;
  cleaningEndedActivityLogs?: boolean | undefined;
  deletingActivityId?: string | null | undefined;
  dateFrom: string;
  dateTo: string;
  errorMessage: string | null;
  filterCounts: Record<RecentLoginActivityFilter, number>;
  loading: boolean;
  onCleanupEndedActivities?: (() => void) | undefined;
  onClearFilters: () => void;
  onDateFromChange: (value: string) => void;
  onDateToChange: (value: string) => void;
  onDeleteEndedActivity?: ((activity: RecentLoginActivity) => void) | undefined;
  onFilterChange: (filter: RecentLoginActivityFilter) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onRoleChange: (role: string) => void;
  onRetry: () => void;
  onSearchChange: (value: string) => void;
  onSortChange: (value: string) => void;
  page: number;
  pageSize: number;
  role: string;
  retrying: boolean;
  search: string;
  selectedFilter: RecentLoginActivityFilter;
  sort: string;
  totalItems: number;
  totalPages: number;
}

const EMPTY_RECENT_LOGIN_ACTIVITIES: readonly RecentLoginActivity[] = [];
const RECENT_LOGIN_ACTIVITY_CLEANUP_DAYS = 30;
const RECENT_LOGIN_ACTIVITY_CLEANUP_LIMIT = 500;
const RECENT_LOGIN_ACTIVITY_PAGE_SIZE_OPTIONS = [4, 8, 12] as const;
const RECENT_LOGIN_FILTER_OPTIONS: readonly {
  readonly id: RecentLoginActivityFilter;
  readonly label: string;
}[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "ended", label: "Ended" },
  { id: "failed", label: "Failed" },
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
  onCloseAutoFocus,
  onOpenChange,
}: {
  activity: RecentLoginActivity | null;
  onCloseAutoFocus: (event: Event) => void;
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
        onCloseAutoFocus={onCloseAutoFocus}
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
              <DetailBlock label="Platform">{activity.platform ?? "Unknown platform"}</DetailBlock>
              <DetailBlock label="User agent summary">
                {activity.userAgentSummary ?? activity.browser ?? "Unknown"}
              </DetailBlock>
            </div>

            <DetailBlock label="Status note">{activity.logoutReason || "No logout reason recorded."}</DetailBlock>
            {activity.failureReason ? (
              <DetailBlock label="Internal failure reason">{activity.failureReason}</DetailBlock>
            ) : null}
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
  dateFrom,
  dateTo,
  errorMessage,
  filterCounts,
  loading,
  onCleanupEndedActivities,
  onClearFilters,
  onDateFromChange,
  onDateToChange,
  onDeleteEndedActivity,
  onFilterChange,
  onPageChange,
  onPageSizeChange,
  onRoleChange,
  onRetry,
  onSearchChange,
  onSortChange,
  page,
  pageSize,
  role,
  retrying,
  search,
  selectedFilter,
  sort,
  totalItems,
  totalPages,
}: DashboardRecentLoginActivityProps) {
  const [cleanupDialogOpen, setCleanupDialogOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<RecentLoginActivity | null>(null);
  const [deleteCandidate, setDeleteCandidate] = useState<RecentLoginActivity | null>(null);
  const activityCardRef = useRef<HTMLDivElement | null>(null);
  const cleanupTriggerRef = useRef<HTMLButtonElement | null>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const detailTriggerRef = useRef<HTMLButtonElement | null>(null);
  const safeActivities = activities ?? EMPTY_RECENT_LOGIN_ACTIVITIES;
  const pageStartIndex = (Math.max(1, page) - 1) * Math.max(1, pageSize);
  const hasActiveFilters = Boolean(
    selectedFilter !== "all"
      || role !== "all"
      || sort !== "eventTime:desc"
      || search.trim()
      || dateFrom
      || dateTo,
  );
  const selectedFilterLabel =
    RECENT_LOGIN_FILTER_OPTIONS.find((option) => option.id === selectedFilter)?.label ?? "All";
  const handleDetailSheetOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setSelectedActivity(null);
    }
  }, []);
  const handleDetailCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault();
    const trigger = detailTriggerRef.current;
    detailTriggerRef.current = null;
    if (trigger?.isConnected) {
      trigger.focus();
    }
  }, []);
  const handleOpenActivityDetail = useCallback((
    activity: RecentLoginActivity,
    trigger: HTMLButtonElement,
  ) => {
    detailTriggerRef.current = trigger;
    setSelectedActivity(activity);
  }, []);
  const handleDeleteDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setDeleteCandidate(null);
    }
  }, []);
  const restoreDialogFocus = useCallback((
    event: Event,
    triggerRef: { current: HTMLButtonElement | null },
  ) => {
    event.preventDefault();
    const trigger = triggerRef.current;
    triggerRef.current = null;
    if (trigger?.isConnected && !trigger.disabled) {
      trigger.focus();
      return;
    }
    activityCardRef.current?.focus();
  }, []);
  const handleCleanupCloseAutoFocus = useCallback((event: Event) => {
    restoreDialogFocus(event, cleanupTriggerRef);
  }, [restoreDialogFocus]);
  const handleDeleteCloseAutoFocus = useCallback((event: Event) => {
    restoreDialogFocus(event, deleteTriggerRef);
  }, [restoreDialogFocus]);
  const handleOpenCleanupDialog = useCallback((trigger: HTMLButtonElement) => {
    cleanupTriggerRef.current = trigger;
    setCleanupDialogOpen(true);
  }, []);
  const handleOpenDeleteDialog = useCallback((
    activity: RecentLoginActivity,
    trigger: HTMLButtonElement,
  ) => {
    deleteTriggerRef.current = trigger;
    setDeleteCandidate(activity);
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
        ref={activityCardRef}
        tabIndex={-1}
        className="min-w-0 max-w-full rounded-2xl border border-border/60 bg-background shadow-sm"
        data-floating-ai-avoid="true"
        data-testid="card-recent-login-activity"
      >
        <CardHeader className="min-w-0 space-y-1 pb-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1">
              <CardTitle className="flex min-w-0 items-center gap-2 break-words text-base sm:text-lg">
                <ShieldCheck className="h-5 w-5 shrink-0" aria-hidden="true" />
                Recent Login Activity
              </CardTitle>
              <p className="text-xs leading-5 text-muted-foreground sm:text-sm">
                Latest access events with masked network details for fast operator review.
              </p>
            </div>
            <div className="flex max-w-full flex-wrap items-center gap-2">
              <Badge variant="outline" className="w-fit rounded-full">
                {totalItems} matched
              </Badge>
              {onCleanupEndedActivities ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-full border-destructive/40 px-3 text-xs text-destructive hover:bg-destructive/10"
                  onClick={(event) => handleOpenCleanupDialog(event.currentTarget)}
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
          {onCleanupEndedActivities ? (
            <div
              className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-border/60 bg-muted/10 px-3 py-2 text-2xs text-muted-foreground"
              aria-label={`Login activity retention policy: ended logs older than ${RECENT_LOGIN_ACTIVITY_CLEANUP_DAYS} days can be cleaned in batches of ${RECENT_LOGIN_ACTIVITY_CLEANUP_LIMIT}; active sessions are protected`}
              data-testid="recent-login-retention-policy"
            >
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 text-foreground" aria-hidden="true" />
                Cleanup threshold: {RECENT_LOGIN_ACTIVITY_CLEANUP_DAYS} days
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Trash2 className="h-3.5 w-3.5 text-foreground" aria-hidden="true" />
                Up to {RECENT_LOGIN_ACTIVITY_CLEANUP_LIMIT} ended logs
              </span>
              <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-300" aria-hidden="true" />
                Active sessions protected
              </span>
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="min-w-0" aria-live="polite">
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
          ) : safeActivities.length > 0 || hasActiveFilters ? (
            <div className="space-y-3">
              <div className="grid min-w-0 gap-2 rounded-xl border border-border/60 bg-muted/10 p-2.5 md:grid-cols-2 xl:grid-cols-[minmax(180px,1fr)_minmax(0,150px)_minmax(0,150px)_auto] xl:items-end">
                <div className="relative min-w-0 md:col-span-2 xl:col-span-1">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <Input
                    type="search"
                    value={search}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder="Search username"
                    aria-label="Search recent login activity by username"
                    className="h-9 pl-9"
                    data-testid="input-recent-login-search"
                  />
                </div>
                <label className="grid min-w-0 gap-1 text-2xs font-medium text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                    From
                  </span>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => onDateFromChange(event.target.value)}
                    aria-label="Recent login activity start date"
                    className="h-9 min-w-0 w-full"
                    data-testid="input-recent-login-date-from"
                  />
                </label>
                <label className="grid min-w-0 gap-1 text-2xs font-medium text-muted-foreground">
                  <span>To</span>
                  <Input
                    type="date"
                    value={dateTo}
                    min={dateFrom || undefined}
                    onChange={(event) => onDateToChange(event.target.value)}
                    aria-label="Recent login activity end date"
                    className="h-9 min-w-0 w-full"
                    data-testid="input-recent-login-date-to"
                  />
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 w-full min-w-0 justify-center rounded-lg px-3 text-xs md:col-span-2 xl:col-span-1 xl:w-auto"
                  onClick={onClearFilters}
                  disabled={!hasActiveFilters}
                  aria-label="Clear recent login activity filters"
                  data-testid="button-recent-login-clear-filters"
                >
                  <X className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Clear
                </Button>
              </div>

              <div
                className="grid min-w-0 grid-cols-2 gap-1 rounded-xl border border-border/60 bg-muted/15 p-1 sm:grid-cols-5"
                role="group"
                aria-label="Filter recent login activity"
              >
                {RECENT_LOGIN_FILTER_OPTIONS.map((option) => {
                  const active = selectedFilter === option.id;
                  const pressedProps = active
                    ? { "aria-pressed": "true" as const }
                    : { "aria-pressed": "false" as const };
                  return (
                    <Button
                      key={option.id}
                      type="button"
                      variant={active ? "default" : "ghost"}
                      size="sm"
                      className="h-8 min-w-0 justify-center rounded-lg px-2 text-xs"
                      onClick={() => onFilterChange(option.id)}
                      {...pressedProps}
                      aria-label={`Show ${option.label.toLowerCase()} login activity, ${filterCounts[option.id]} records`}
                      data-testid={`button-login-activity-filter-${option.id}`}
                    >
                      <span className="truncate">{option.label}</span>
                      <span className="ml-1.5 rounded-full bg-background/80 px-1.5 py-0.5 text-2xs text-foreground">
                        {filterCounts[option.id]}
                      </span>
                    </Button>
                  );
                })}
              </div>

              <div className="grid min-w-0 gap-2 rounded-xl border border-border/60 bg-background/60 p-2.5 sm:grid-cols-2">
                <label className="grid min-w-0 gap-1 text-2xs font-medium text-muted-foreground">
                  Role
                  <Select value={role} onValueChange={onRoleChange}>
                    <SelectTrigger
                      className="h-9 min-w-0 w-full"
                      aria-label="Filter recent login activity by role"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All roles</SelectItem>
                      <SelectItem value="superuser">Superuser</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="unknown">Unknown account</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="grid min-w-0 gap-1 text-2xs font-medium text-muted-foreground">
                  Sort
                  <Select value={sort} onValueChange={onSortChange}>
                    <SelectTrigger
                      className="h-9 min-w-0 w-full"
                      aria-label="Sort recent login activity"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eventTime:desc">Newest first</SelectItem>
                      <SelectItem value="eventTime:asc">Oldest first</SelectItem>
                      <SelectItem value="username:asc">Username A-Z</SelectItem>
                      <SelectItem value="role:asc">Role A-Z</SelectItem>
                      <SelectItem value="status:asc">Status A-Z</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
              </div>

              {safeActivities.length > 0 ? (
                <>
                  <AppPaginationBar
                    loading={retrying}
                    page={page}
                    totalPages={totalPages}
                    pageSize={pageSize}
                    pageSizeOptions={RECENT_LOGIN_ACTIVITY_PAGE_SIZE_OPTIONS}
                    totalItems={totalItems}
                    itemLabel="login records"
                    onPageChange={onPageChange}
                    onPageSizeChange={onPageSizeChange}
                  />
                  <div
                    className="grid min-w-0 max-w-full max-h-[360px] gap-2 overflow-y-auto pr-1 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2"
                    role="region"
                    tabIndex={0}
                    aria-label={`${selectedFilterLabel} recent login activity list`}
                  >
                    {safeActivities.map((activity, index) => {
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
                          className="min-w-0 rounded-xl border border-border/60 bg-muted/10 p-3 shadow-sm"
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
                              <p className="font-medium text-foreground">
                                {activity.status === "failed" ? "Attempt" : "Login"}
                              </p>
                              <p className="mt-1 break-words leading-5">{formattedLoginTime}</p>
                            </div>
                            <div className="rounded-lg border border-border/50 bg-background/60 p-2.5">
                              <p className="font-medium text-foreground">Last activity</p>
                              <p className="mt-1 break-words leading-5">{formattedLastActivityTime}</p>
                            </div>
                          </div>

                          <div className="mt-2 flex flex-col gap-2 rounded-lg border border-border/50 bg-background/60 p-2.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                            <span className="flex min-w-0 items-center gap-2">
                              <Globe2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                              <span className="truncate" title={browser}>
                                {activity.platform ? `${browser} · ${activity.platform}` : browser}
                              </span>
                            </span>
                            <span className="min-w-0 break-all font-medium text-foreground sm:max-w-[45%] sm:text-right">{ipAddress}</span>
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
                              onClick={(event) => handleOpenActivityDetail(activity, event.currentTarget)}
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
                                onClick={(event) => handleOpenDeleteDialog(activity, event.currentTarget)}
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
                  No {selectedFilterLabel.toLowerCase()} login activity matches the current server filters.
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
        onCloseAutoFocus={handleDetailCloseAutoFocus}
        onOpenChange={handleDetailSheetOpenChange}
      />
      <AlertDialog open={deleteCandidate !== null} onOpenChange={handleDeleteDialogOpenChange}>
        <AlertDialogContent onCloseAutoFocus={handleDeleteCloseAutoFocus}>
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
        <AlertDialogContent onCloseAutoFocus={handleCleanupCloseAutoFocus}>
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
