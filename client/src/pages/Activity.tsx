import { useCallback, useEffect, useRef, useState } from "react";
import { Filter, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ActivityFilters } from "@/lib/api";
import { banUser, deleteActivityLog, getAllActivity, getBannedUsers, getFilteredActivity, kickUser, unbanUser } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { ActivityActionDialogs } from "@/pages/activity/ActivityActionDialogs";
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
  const [selectedActivity, setSelectedActivity] = useState<ActivityRecord | null>(null);
  const [selectedBannedUser, setSelectedBannedUser] = useState<BannedUser | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<ActivityFilters>(DEFAULT_ACTIVITY_FILTERS);
  const [dateFromOpen, setDateFromOpen] = useState(false);
  const [dateToOpen, setDateToOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(true);

  const filtersRef = useRef<ActivityFilters>(filters);

  const fetchActivities = useCallback(async (useFilters = false) => {
    setLoading(true);
    try {
      const currentFilters = filtersRef.current;
      const activityResponse = useFilters && hasActiveActivityFilters(currentFilters)
        ? await getFilteredActivity(currentFilters)
        : await getAllActivity();

      setActivities(activityResponse.activities || []);

      if (canModerateActivity) {
        const bannedResponse = await getBannedUsers();
        setBannedUsers(bannedResponse.users || []);
      } else {
        setBannedUsers([]);
      }
    } catch (error) {
      console.error("Failed to fetch activities:", error);
    } finally {
      setLoading(false);
    }
  }, [canModerateActivity]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    void fetchActivities(false);
  }, [fetchActivities]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!hasActiveActivityFilters(filtersRef.current)) {
        void fetchActivities(false);
      }
    }, 30000);

    return () => window.clearInterval(interval);
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

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2">Activity Monitor</h1>
            <p className="text-muted-foreground">Monitor user activity in real-time</p>
          </div>
          <div className="flex gap-2 flex-wrap">
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
        />
      </div>

      <ActivityActionDialogs
        banDialogOpen={banDialogOpen}
        deleteDialogOpen={deleteDialogOpen}
        kickDialogOpen={kickDialogOpen}
        onBanConfirm={() => void handleBanConfirm()}
        onBanDialogOpenChange={setBanDialogOpen}
        onDeleteConfirm={() => void handleDeleteConfirm()}
        onDeleteDialogOpenChange={setDeleteDialogOpen}
        onKickConfirm={() => void handleKickConfirm()}
        onKickDialogOpenChange={setKickDialogOpen}
        onUnbanConfirm={() => void handleUnbanConfirm()}
        onUnbanDialogOpenChange={setUnbanDialogOpen}
        selectedActivity={selectedActivity}
        selectedBannedUser={selectedBannedUser}
        unbanDialogOpen={unbanDialogOpen}
      />
    </div>
  );
}
