import { useMemo, useState } from "react";
import type { ActivityRecord, BannedUser } from "@/pages/activity/types";

export function useActivityActionDialogsState() {
  const [kickDialogOpen, setKickDialogOpen] = useState(false);
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [unbanDialogOpen, setUnbanDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState<ActivityRecord | null>(null);
  const [selectedBannedUser, setSelectedBannedUser] = useState<BannedUser | null>(null);

  const hasOpenActionDialog = useMemo(
    () =>
      kickDialogOpen ||
      banDialogOpen ||
      unbanDialogOpen ||
      deleteDialogOpen ||
      bulkDeleteDialogOpen,
    [banDialogOpen, bulkDeleteDialogOpen, deleteDialogOpen, kickDialogOpen, unbanDialogOpen],
  );

  return {
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
    hasOpenActionDialog,
  };
}
