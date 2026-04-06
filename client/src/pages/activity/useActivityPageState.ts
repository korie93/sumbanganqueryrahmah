import { useMemo } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { buildActivitySummaryCounts } from "@/pages/activity/activity-page-state-utils";
import { useActivityActionState } from "@/pages/activity/useActivityActionState";
import { useActivityDataState } from "@/pages/activity/useActivityDataState";
import { useActivitySelectionState } from "@/pages/activity/useActivitySelectionState";
import { getCurrentActivityRole } from "@/pages/activity/utils";

export function useActivityPageState() {
  const isMobile = useIsMobile();
  const shouldDeferSecondaryMobileSections =
    isMobile || (typeof window !== "undefined" && window.innerWidth < 768);
  const currentRole = getCurrentActivityRole();
  const canModerateActivity = currentRole === "admin" || currentRole === "superuser";

  const dataState = useActivityDataState({ canModerateActivity });
  const selectionState = useActivitySelectionState({ activities: dataState.activities });
  const actionState = useActivityActionState({
    refreshCurrentView: dataState.refreshCurrentView,
    selectedActivityIds: selectionState.selectedActivityIds,
    setSelectedActivityIds: selectionState.setSelectedActivityIds,
  });
  const summaryCounts = useMemo(
    () => buildActivitySummaryCounts(dataState.activities),
    [dataState.activities],
  );

  return {
    isMobile,
    shouldDeferSecondaryMobileSections,
    canModerateActivity,
    activities: dataState.activities,
    bannedUsers: dataState.bannedUsers,
    loading: dataState.loading,
    actionLoading: actionState.actionLoading,
    kickDialogOpen: actionState.kickDialogOpen,
    setKickDialogOpen: actionState.setKickDialogOpen,
    banDialogOpen: actionState.banDialogOpen,
    setBanDialogOpen: actionState.setBanDialogOpen,
    unbanDialogOpen: actionState.unbanDialogOpen,
    setUnbanDialogOpen: actionState.setUnbanDialogOpen,
    deleteDialogOpen: actionState.deleteDialogOpen,
    setDeleteDialogOpen: actionState.setDeleteDialogOpen,
    bulkDeleteDialogOpen: actionState.bulkDeleteDialogOpen,
    setBulkDeleteDialogOpen: actionState.setBulkDeleteDialogOpen,
    selectedActivity: actionState.selectedActivity,
    setSelectedActivity: actionState.setSelectedActivity,
    selectedBannedUser: actionState.selectedBannedUser,
    setSelectedBannedUser: actionState.setSelectedBannedUser,
    selectedActivityIds: selectionState.selectedActivityIds,
    setSelectedActivityIds: selectionState.setSelectedActivityIds,
    showFilters: dataState.showFilters,
    setShowFilters: dataState.setShowFilters,
    filters: dataState.filters,
    setFilters: dataState.setFilters,
    dateFromOpen: dataState.dateFromOpen,
    setDateFromOpen: dataState.setDateFromOpen,
    dateToOpen: dataState.dateToOpen,
    setDateToOpen: dataState.setDateToOpen,
    logsOpen: dataState.logsOpen,
    setLogsOpen: dataState.setLogsOpen,
    fetchActivities: dataState.fetchActivities,
    handleApplyFilters: dataState.handleApplyFilters,
    handleClearFilters: dataState.handleClearFilters,
    toggleStatusFilter: dataState.toggleStatusFilter,
    handleKickConfirm: actionState.handleKickConfirm,
    handleBanConfirm: actionState.handleBanConfirm,
    handleDeleteConfirm: actionState.handleDeleteConfirm,
    handleBulkDeleteConfirm: actionState.handleBulkDeleteConfirm,
    handleUnbanConfirm: actionState.handleUnbanConfirm,
    selectedVisibleCount: selectionState.selectedVisibleCount,
    summaryCounts,
    allVisibleSelected: selectionState.allVisibleSelected,
    partiallySelected: selectionState.partiallySelected,
    hasOpenActionDialog: actionState.hasOpenActionDialog,
  };
}
