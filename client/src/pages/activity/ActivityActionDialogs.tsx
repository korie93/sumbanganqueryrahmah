import { ActivityBanDialog } from "@/pages/activity/ActivityBanDialog";
import { ActivityBulkDeleteDialog } from "@/pages/activity/ActivityBulkDeleteDialog";
import { ActivityDeleteDialog } from "@/pages/activity/ActivityDeleteDialog";
import { ActivityKickDialog } from "@/pages/activity/ActivityKickDialog";
import { ActivityUnbanDialog } from "@/pages/activity/ActivityUnbanDialog";
import type { ActivityRecord, BannedUser } from "@/pages/activity/types";

interface ActivityActionDialogsProps {
  banDialogOpen: boolean;
  deleteDialogOpen: boolean;
  bulkDeleteDialogOpen: boolean;
  kickDialogOpen: boolean;
  onBanConfirm: () => void;
  onBanDialogOpenChange: (open: boolean) => void;
  onDeleteConfirm: () => void;
  onDeleteDialogOpenChange: (open: boolean) => void;
  onBulkDeleteConfirm: () => void;
  onBulkDeleteDialogOpenChange: (open: boolean) => void;
  onKickConfirm: () => void;
  onKickDialogOpenChange: (open: boolean) => void;
  onUnbanConfirm: () => void;
  onUnbanDialogOpenChange: (open: boolean) => void;
  selectedActivity: ActivityRecord | null;
  selectedBannedUser: BannedUser | null;
  selectedBulkCount: number;
  unbanDialogOpen: boolean;
}

export function ActivityActionDialogs({
  banDialogOpen,
  deleteDialogOpen,
  bulkDeleteDialogOpen,
  kickDialogOpen,
  onBanConfirm,
  onBanDialogOpenChange,
  onDeleteConfirm,
  onDeleteDialogOpenChange,
  onBulkDeleteConfirm,
  onBulkDeleteDialogOpenChange,
  onKickConfirm,
  onKickDialogOpenChange,
  onUnbanConfirm,
  onUnbanDialogOpenChange,
  selectedActivity,
  selectedBannedUser,
  selectedBulkCount,
  unbanDialogOpen,
}: ActivityActionDialogsProps) {
  return (
    <>
      <ActivityKickDialog
        onConfirm={onKickConfirm}
        onOpenChange={onKickDialogOpenChange}
        open={kickDialogOpen}
        selectedActivity={selectedActivity}
      />

      <ActivityBanDialog
        onConfirm={onBanConfirm}
        onOpenChange={onBanDialogOpenChange}
        open={banDialogOpen}
        selectedActivity={selectedActivity}
      />

      <ActivityDeleteDialog
        onConfirm={onDeleteConfirm}
        onOpenChange={onDeleteDialogOpenChange}
        open={deleteDialogOpen}
        selectedActivity={selectedActivity}
      />

      <ActivityBulkDeleteDialog
        onConfirm={onBulkDeleteConfirm}
        onOpenChange={onBulkDeleteDialogOpenChange}
        open={bulkDeleteDialogOpen}
        selectedBulkCount={selectedBulkCount}
      />

      <ActivityUnbanDialog
        onConfirm={onUnbanConfirm}
        onOpenChange={onUnbanDialogOpenChange}
        open={unbanDialogOpen}
        selectedBannedUser={selectedBannedUser}
      />
    </>
  );
}
