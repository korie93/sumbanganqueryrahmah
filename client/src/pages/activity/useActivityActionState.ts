import type { UseActivityActionStateOptions } from "@/pages/activity/activity-action-state-shared";
import { useActivityActionDialogsState } from "@/pages/activity/useActivityActionDialogsState";
import { useActivityModerationActionHandlers } from "@/pages/activity/useActivityModerationActionHandlers";

export function useActivityActionState({
  refreshCurrentView,
  selectedActivityIds,
  setSelectedActivityIds,
}: UseActivityActionStateOptions) {
  const dialogState = useActivityActionDialogsState();
  const actionHandlers = useActivityModerationActionHandlers({
    refreshCurrentView,
    selectedActivityIds,
    setSelectedActivityIds,
    selectedActivity: dialogState.selectedActivity,
    selectedBannedUser: dialogState.selectedBannedUser,
    setBanDialogOpen: dialogState.setBanDialogOpen,
    setBulkDeleteDialogOpen: dialogState.setBulkDeleteDialogOpen,
    setDeleteDialogOpen: dialogState.setDeleteDialogOpen,
    setKickDialogOpen: dialogState.setKickDialogOpen,
    setSelectedActivity: dialogState.setSelectedActivity,
    setSelectedBannedUser: dialogState.setSelectedBannedUser,
    setUnbanDialogOpen: dialogState.setUnbanDialogOpen,
  });

  return {
    ...dialogState,
    ...actionHandlers,
  };
}
