import { useCallback, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  banUser,
  deleteActivityLog,
  deleteActivityLogsBulk,
  kickUser,
  unbanUser,
} from "@/lib/api";
import {
  buildBulkDeleteToastPayload,
  getActivityActionErrorDescription,
  getUnbanActionLoadingKey,
  removeSelectedActivityId,
} from "@/pages/activity/activity-action-state-utils";
import type { UseActivityModerationActionHandlersOptions } from "@/pages/activity/activity-action-state-shared";

export function useActivityModerationActionHandlers({
  refreshCurrentView,
  selectedActivity,
  selectedActivityIds,
  selectedBannedUser,
  setBanDialogOpen,
  setBulkDeleteDialogOpen,
  setDeleteDialogOpen,
  setKickDialogOpen,
  setSelectedActivity,
  setSelectedActivityIds,
  setSelectedBannedUser,
  setUnbanDialogOpen,
}: UseActivityModerationActionHandlersOptions) {
  const { toast } = useToast();
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleKickConfirm = useCallback(async () => {
    if (!selectedActivity) return;

    setActionLoading(selectedActivity.id);
    try {
      await kickUser(selectedActivity.id);
      toast({
        title: "Success",
        description: `${selectedActivity.username} has been force logged out.`,
      });
      refreshCurrentView();
    } catch (error) {
      toast({
        title: "Failed",
        description: getActivityActionErrorDescription(error, "Failed to kick user."),
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setKickDialogOpen(false);
      setSelectedActivity(null);
    }
  }, [refreshCurrentView, selectedActivity, setKickDialogOpen, setSelectedActivity, toast]);

  const handleBanConfirm = useCallback(async () => {
    if (!selectedActivity) return;

    setActionLoading(selectedActivity.id);
    try {
      await banUser(selectedActivity.id);
      toast({
        title: "Success",
        description: `${selectedActivity.username} has been banned.`,
      });
      refreshCurrentView();
    } catch (error) {
      toast({
        title: "Failed",
        description: getActivityActionErrorDescription(error, "Failed to ban user."),
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setBanDialogOpen(false);
      setSelectedActivity(null);
    }
  }, [refreshCurrentView, selectedActivity, setBanDialogOpen, setSelectedActivity, toast]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!selectedActivity) return;

    setActionLoading(selectedActivity.id);
    try {
      await deleteActivityLog(selectedActivity.id);
      toast({
        title: "Success",
        description: `Activity log for ${selectedActivity.username} has been deleted.`,
      });
      setSelectedActivityIds((previous) => removeSelectedActivityId(previous, selectedActivity.id));
      refreshCurrentView();
    } catch (error) {
      toast({
        title: "Failed",
        description: getActivityActionErrorDescription(error, "Failed to delete log."),
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setDeleteDialogOpen(false);
      setSelectedActivity(null);
    }
  }, [
    refreshCurrentView,
    selectedActivity,
    setDeleteDialogOpen,
    setSelectedActivity,
    setSelectedActivityIds,
    toast,
  ]);

  const handleBulkDeleteConfirm = useCallback(async () => {
    const ids = Array.from(selectedActivityIds);
    if (ids.length === 0) return;

    setActionLoading("bulk-delete");
    try {
      const response = await deleteActivityLogsBulk(ids);
      setSelectedActivityIds(new Set());
      toast(buildBulkDeleteToastPayload(response));
      refreshCurrentView();
    } catch (error) {
      toast({
        title: "Failed",
        description: getActivityActionErrorDescription(error, "Failed to delete selected logs."),
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setBulkDeleteDialogOpen(false);
    }
  }, [refreshCurrentView, selectedActivityIds, setBulkDeleteDialogOpen, setSelectedActivityIds, toast]);

  const handleUnbanConfirm = useCallback(async () => {
    if (!selectedBannedUser) return;

    setActionLoading(getUnbanActionLoadingKey(selectedBannedUser));
    try {
      if (!selectedBannedUser.banId) {
        throw new Error("Missing banId for unban.");
      }
      await unbanUser(selectedBannedUser.banId);
      toast({
        title: "Success",
        description: `${selectedBannedUser.username} has been unbanned.`,
      });
      refreshCurrentView();
    } catch (error) {
      toast({
        title: "Failed",
        description: getActivityActionErrorDescription(error, "Failed to unban user."),
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setUnbanDialogOpen(false);
      setSelectedBannedUser(null);
    }
  }, [refreshCurrentView, selectedBannedUser, setSelectedBannedUser, setUnbanDialogOpen, toast]);

  return {
    actionLoading,
    handleKickConfirm,
    handleBanConfirm,
    handleDeleteConfirm,
    handleBulkDeleteConfirm,
    handleUnbanConfirm,
  };
}
