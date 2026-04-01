import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Filter, RefreshCw, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActivityFilters } from "@/lib/api";
import {
  banUser,
  deleteActivityLog,
  deleteActivityLogsBulk,
  getAllActivity,
  getBannedUsers,
  getFilteredActivity,
  kickUser,
  unbanUser,
} from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { ActivityBannedUsersPanel } from "@/pages/activity/ActivityBannedUsersPanel";
import { ActivityFiltersPanel } from "@/pages/activity/ActivityFiltersPanel";
import { ActivityLogsTable } from "@/pages/activity/ActivityLogsTable";
import { ActivitySummaryCards } from "@/pages/activity/ActivitySummaryCards";
import { DEFAULT_ACTIVITY_FILTERS } from "@/pages/activity/types";
import type { ActivityRecord, ActivityStatus, BannedUser } from "@/pages/activity/types";
import {
  countActivitiesByStatus,
  getActivityFilterCount,
  getCurrentActivityRole,
  hasActiveActivityFilters,
} from "@/pages/activity/utils";

const ActivityActionDialogs = lazy(() =>
  import("@/pages/activity/ActivityActionDialogs").then((module) => ({
    default: module.ActivityActionDialogs,
  })),
);

export default function Activity() {
  const currentRole = getCurrentActivityRole();
  const canModerateActivity = currentRole === "admin" || currentRole === "superuser";
  const { toast } = useToast();

  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [bannedUsers, setBannedUsers] = useState<BannedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [kickDialogOpen, setKickDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [unbanDialogOpen, setUnbanDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityRecord | null>(null);
  const [selectedBannedUser, setSelectedBannedUser] = useState<BannedUser | null>(null);
  const [selectedActivityIds, setSelectedActivityIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<ActivityFilters>(DEFAULT_ACTIVITY_FILTERS);
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(true);

  const filtersRef = useRef<ActivityFilters>(filters);
  const activeRequestIdRef = useRef(0);
  const fetchControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      activeRequestIdRef.current += 1;
      fetchControllerRef.current?.abort();
      fetchControllerRef.current = null;
    };
  }, []);

  const fetchActivities = useCallback(async (useFilters = false) => {
    const requestId = ++activeRequestIdRef.current;
    fetchControllerRef.current?.abort();
    const controller = new AbortController();
    fetchControllerRef.current = controller;
    setLoading(true);
    try {
      const currentFilters = filtersRef.current;
      const activityResponse = useFilters && hasActiveActivityFilters(currentFilters)
        ? await getFilteredActivity(currentFilters, { signal: controller.signal })
        : await getAllActivity({ signal: controller.signal });

      if (controller.signal.aborted || !mountedRef.current || requestId !== activeRequestIdRef.current) {
        return;
      }

      const nextActivities = activityResponse.activities || [];
      setActivities(nextActivities);
      setSelectedActivityIds((previous) => {
        if (previous.size === 0) return previous;
        const validIds = new Set(nextActivities.map((activity: ActivityRecord) => activity.id));
        let changed = false;
        const next = new Set<string>();
        for (const id of previous) {
          if (validIds.has(id)) {
            next.add(id);
          } else {
            changed = true;
          }
        }
        return changed ? next : previous;
      });

      if (canModerateActivity) {
        const bannedResponse = await getBannedUsers({ signal: controller.signal });
        if (controller.signal.aborted || !mountedRef.current || requestId !== activeRequestIdRef.current) {
          return;
        }
        setBannedUsers(bannedResponse.users || []);
      } else {
        setBannedUsers([]);
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }
      console.error("Failed to fetch activities:", error);
    } finally {
      if (fetchControllerRef.current === controller) {
        fetchControllerRef.current = null;
      }
      if (mountedRef.current && requestId === activeRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [canModerateActivity]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    void fetchActivities(false);
  }, [fetchActivities]);

  useEffect(() => {
    const shouldRefresh = () =>
      typeof document === "undefined" || document.visibilityState === "visible";

    const refreshVisibleActivity = () => {
      if (!hasActiveActivityFilters(filtersRef.current) && shouldRefresh()) {
        void fetchActivities(false);
      }
    };

    const interval = window.setInterval(() => {
      refreshVisibleActivity();
    }, 30000);

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        refreshVisibleActivity();
      }
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }

    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      window.clearInterval(interval);
    };
  }, [fetchActivities]);

  const handleApplyFilters = () => {
    void fetchActivities(true);
  };

  const handleClearFilters = () => {
    setFilters(DEFAULT_ACTIVITY_FILTERS);
  };

  const toggleStatusFilter = (status: ActivityStatus) => {
    setFilters((previous) => {
      const currentStatus = previous.status || [];
      return currentStatus.includes(status)
        ? { ...previous, status: currentStatus.filter((value) => value !== status) }
        : { ...previous, status: [...currentStatus, status] };
    });
  };

  const handleKickConfirm = async () => {
    if (!selectedActivity) return;

    setActionLoading(selectedActivity.id);
    try {
      await kickUser(selectedActivity.id);
      toast({
        title: "Success",
        description: `${selectedActivity.username} has been force logged out.`,
      });
      void fetchActivities(hasActiveActivityFilters(filtersRef.current));
    } catch (error) {
      toast({
        title: "Failed",
        description: error instanceof Error ? error.message : "Failed to kick user.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setKickDialogOpen(false);
      setSelectedActivity(null);
    }
  };

  const handleBanConfirm = async () => {
    if (!selectedActivity) return;

    setActionLoading(selectedActivity.id);
    try {
      await banUser(selectedActivity.id);
      toast({
        title: "Success",
        description: `${selectedActivity.username} has been banned.`,
      });
      void fetchActivities(hasActiveActivityFilters(filtersRef.current));
    } catch (error) {
      toast({
        title: "Failed",
        description: error instanceof Error ? error.message : "Failed to ban user.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setBanDialogOpen(false);
      setSelectedActivity(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!selectedActivity) return;

    setActionLoading(selectedActivity.id);
    try {
      await deleteActivityLog(selectedActivity.id);
      toast({
        title: "Success",
        description: `Activity log for ${selectedActivity.username} has been deleted.`,
      });
      setSelectedActivityIds((previous) => {
        if (!previous.has(selectedActivity.id)) return previous;
        const next = new Set(previous);
        next.delete(selectedActivity.id);
        return next;
      });
      void fetchActivities(hasActiveActivityFilters(filtersRef.current));
    } catch (error) {
      toast({
        title: "Failed",
        description: error instanceof Error ? error.message : "Failed to delete log.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setDeleteDialogOpen(false);
      setSelectedActivity(null);
    }
  };

  const handleBulkDeleteConfirm = async () => {
    const ids = Array.from(selectedActivityIds);
    if (ids.length === 0) return;

    setActionLoading("bulk-delete");
    try {
      const response = await deleteActivityLogsBulk(ids);
      setSelectedActivityIds(new Set());
      toast({
        title: response.deletedCount === response.requestedCount ? "Success" : "Partial Success",
        description: response.deletedCount === response.requestedCount
          ? `${response.deletedCount} activity log(s) deleted.`
          : `${response.deletedCount} deleted, ${response.notFoundIds.length} missing.`,
        variant: response.deletedCount === response.requestedCount ? "default" : "destructive",
      });
      void fetchActivities(hasActiveActivityFilters(filtersRef.current));
    } catch (error) {
      toast({
        title: "Failed",
        description: error instanceof Error ? error.message : "Failed to delete selected logs.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setBulkDeleteDialogOpen(false);
    }
  };

  const handleUnbanConfirm = async () => {
    if (!selectedBannedUser) return;

    setActionLoading(selectedBannedUser.banId || selectedBannedUser.username);
    try {
      if (!selectedBannedUser.banId) {
        throw new Error("Missing banId for unban.");
      }
      await unbanUser(selectedBannedUser.banId);
      toast({
        title: "Success",
        description: `${selectedBannedUser.username} has been unbanned.`,
      });
      void fetchActivities(hasActiveActivityFilters(filtersRef.current));
    } catch (error) {
      toast({
        title: "Failed",
        description: error instanceof Error ? error.message : "Failed to unban user.",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setUnbanDialogOpen(false);
      setSelectedBannedUser(null);
    }
  };

  const selectedVisibleCount = useMemo(
    () => activities.filter((activity) => selectedActivityIds.has(activity.id)).length,
    [activities, selectedActivityIds],
  );
  const allVisibleSelected = activities.length > 0 && selectedVisibleCount === activities.length;
  const partiallySelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const hasOpenActionDialog =
    kickDialogOpen ||
    banDialogOpen ||
    unbanDialogOpen ||
    deleteDialogOpen ||
    bulkDeleteDialogOpen;

  return (
    <div className="app-shell-min-height bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4" data-floating-ai-avoid="true">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Activity Monitor</h1>
            <p className="text-muted-foreground">Monitor user activity in real-time</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {canModerateActivity && selectedActivityIds.size > 0 ? (
              <Button
                variant="destructive"
                onClick={() => setBulkDeleteDialogOpen(true)}
                data-testid="button-bulk-delete-activity"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Selected ({selectedActivityIds.size})
              </Button>
            ) : null}
            <Button
              variant={showFilters ? "default" : "outline"}
              onClick={() => setShowFilters((previous) => !previous)}
              data-testid="button-toggle-filters"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filter
              {hasActiveActivityFilters(filters) ? (
                <Badge variant="secondary" className="ml-2">
                  {getActivityFilterCount(filters)}
                </Badge>
              ) : null}
            </Button>
            <Button variant="outline" onClick={() => void fetchActivities(hasActiveActivityFilters(filters))} disabled={loading} data-testid="button-refresh">
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>

        {showFilters ? (
          <ActivityFiltersPanel
            dateFromOpen={dateFromOpen}
            dateToOpen={dateToOpen}
            filters={filters}
            onApply={handleApplyFilters}
            onClear={handleClearFilters}
            onDateFromOpenChange={setDateFromOpen}
            onDateToOpenChange={setDateToOpen}
            onFieldChange={(field, value) => setFilters((previous) => ({ ...previous, [field]: value }))}
            onToggleStatus={toggleStatusFilter}
          />
        ) : null}

        <ActivitySummaryCards
          bannedCount={bannedUsers.length}
          idleCount={countActivitiesByStatus(activities, "IDLE")}
          kickedCount={countActivitiesByStatus(activities, "KICKED")}
          logoutCount={countActivitiesByStatus(activities, "LOGOUT")}
          onlineCount={countActivitiesByStatus(activities, "ONLINE")}
        />

        {canModerateActivity ? (
          <ActivityBannedUsersPanel
            actionLoading={actionLoading}
            bannedUsers={bannedUsers}
            onUnbanClick={(user) => {
              setSelectedBannedUser(user);
              setUnbanDialogOpen(true);
            }}
          />
        ) : null}

        <ActivityLogsTable
          actionLoading={actionLoading}
          activities={activities}
          canModerateActivity={canModerateActivity}
          loading={loading}
          logsOpen={logsOpen}
          onBanClick={(activity) => {
            setSelectedActivity(activity);
            setBanDialogOpen(true);
          }}
          onDeleteClick={(activity) => {
            setSelectedActivity(activity);
            setDeleteDialogOpen(true);
          }}
          onKickClick={(activity) => {
            setSelectedActivity(activity);
            setKickDialogOpen(true);
          }}
          onLogsOpenChange={setLogsOpen}
          onToggleSelected={(activityId, checked) => {
            setSelectedActivityIds((previous) => {
              const next = new Set(previous);
              if (checked) {
                next.add(activityId);
              } else {
                next.delete(activityId);
              }
              return next;
            });
          }}
          onToggleSelectAllVisible={(checked) => {
            setSelectedActivityIds((previous) => {
              const next = new Set(previous);
              for (const activity of activities) {
                if (checked) {
                  next.add(activity.id);
                } else {
                  next.delete(activity.id);
                }
              }
              return next;
            });
          }}
          selectedActivityIds={selectedActivityIds}
          allVisibleSelected={allVisibleSelected}
          partiallySelected={partiallySelected}
        />
      </div>

      {hasOpenActionDialog ? (
        <Suspense fallback={null}>
          <ActivityActionDialogs
            banDialogOpen={banDialogOpen}
            bulkDeleteDialogOpen={bulkDeleteDialogOpen}
            deleteDialogOpen={deleteDialogOpen}
            kickDialogOpen={kickDialogOpen}
            onBanConfirm={() => void handleBanConfirm()}
            onBanDialogOpenChange={setBanDialogOpen}
            onDeleteConfirm={() => void handleDeleteConfirm()}
            onDeleteDialogOpenChange={setDeleteDialogOpen}
            onBulkDeleteConfirm={() => void handleBulkDeleteConfirm()}
            onBulkDeleteDialogOpenChange={setBulkDeleteDialogOpen}
            onKickConfirm={() => void handleKickConfirm()}
            onKickDialogOpenChange={setKickDialogOpen}
            onUnbanConfirm={() => void handleUnbanConfirm()}
            onUnbanDialogOpenChange={setUnbanDialogOpen}
            selectedActivity={selectedActivity}
            selectedBannedUser={selectedBannedUser}
            selectedBulkCount={selectedActivityIds.size}
            unbanDialogOpen={unbanDialogOpen}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
