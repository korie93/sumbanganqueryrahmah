import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
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
import { DEFAULT_ACTIVITY_FILTERS } from "@/pages/activity/types";
import type { ActivityRecord, ActivityStatus, BannedUser } from "@/pages/activity/types";
import {
  getCurrentActivityRole,
  hasActiveActivityFilters,
} from "@/pages/activity/utils";

export function useActivityPageState() {
  const isMobile = useIsMobile();
  const shouldDeferSecondaryMobileSections =
    isMobile || (typeof window !== "undefined" && window.innerWidth < 768);
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

  const handleApplyFilters = useCallback(() => {
    void fetchActivities(true);
  }, [fetchActivities]);

  const handleClearFilters = useCallback(() => {
    setFilters(DEFAULT_ACTIVITY_FILTERS);
  }, []);

  const toggleStatusFilter = useCallback((status: ActivityStatus) => {
    setFilters((previous) => {
      const currentStatus = previous.status || [];
      return currentStatus.includes(status)
        ? { ...previous, status: currentStatus.filter((value) => value !== status) }
        : { ...previous, status: [...currentStatus, status] };
    });
  }, []);

  const handleKickConfirm = useCallback(async () => {
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
  }, [fetchActivities, selectedActivity, toast]);

  const handleBanConfirm = useCallback(async () => {
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
  }, [fetchActivities, selectedActivity, toast]);

  const handleDeleteConfirm = useCallback(async () => {
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
  }, [fetchActivities, selectedActivity, toast]);

  const handleBulkDeleteConfirm = useCallback(async () => {
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
  }, [fetchActivities, selectedActivityIds, toast]);

  const handleUnbanConfirm = useCallback(async () => {
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
  }, [fetchActivities, selectedBannedUser, toast]);

  const selectedVisibleCount = useMemo(
    () => activities.filter((activity) => selectedActivityIds.has(activity.id)).length,
    [activities, selectedActivityIds],
  );
  const summaryCounts = useMemo(() => {
    let onlineCount = 0;
    let idleCount = 0;
    let logoutCount = 0;
    let kickedCount = 0;

    for (const activity of activities) {
      switch (activity.status) {
        case "ONLINE":
          onlineCount += 1;
          break;
        case "IDLE":
          idleCount += 1;
          break;
        case "LOGOUT":
          logoutCount += 1;
          break;
        case "KICKED":
          kickedCount += 1;
          break;
        default:
          break;
      }
    }

    return {
      idleCount,
      kickedCount,
      logoutCount,
      onlineCount,
    };
  }, [activities]);
  const allVisibleSelected = activities.length > 0 && selectedVisibleCount === activities.length;
  const partiallySelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const hasOpenActionDialog =
    kickDialogOpen ||
    banDialogOpen ||
    unbanDialogOpen ||
    deleteDialogOpen ||
    bulkDeleteDialogOpen;

  return {
    isMobile,
    shouldDeferSecondaryMobileSections,
    canModerateActivity,
    activities,
    bannedUsers,
    loading,
    actionLoading,
    kickDialogOpen,
    setKickDialogOpen,
    banDialogOpen,
    setBanDialogOpen,
    unbanDialogOpen,
    setUnbanDialogOpen,
    deleteDialogOpen,
    setDeleteDialogOpen,
    bulkDeleteDialogOpen,
    setBulkDeleteDialogOpen,
    selectedActivity,
    setSelectedActivity,
    selectedBannedUser,
    setSelectedBannedUser,
    selectedActivityIds,
    setSelectedActivityIds,
    showFilters,
    setShowFilters,
    filters,
    setFilters,
    dateFromOpen,
    setDateFromOpen,
    dateToOpen,
    setDateToOpen,
    logsOpen,
    setLogsOpen,
    fetchActivities,
    handleApplyFilters,
    handleClearFilters,
    toggleStatusFilter,
    handleKickConfirm,
    handleBanConfirm,
    handleDeleteConfirm,
    handleBulkDeleteConfirm,
    handleUnbanConfirm,
    selectedVisibleCount,
    summaryCounts,
    allVisibleSelected,
    partiallySelected,
    hasOpenActionDialog,
  };
}
