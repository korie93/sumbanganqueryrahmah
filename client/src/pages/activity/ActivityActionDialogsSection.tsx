import { Suspense, lazy } from "react";
import type { ActivityRecord, BannedUser } from "@/pages/activity/types";

const ActivityActionDialogs = lazy(() =>
  import("@/pages/activity/ActivityActionDialogs").then((module) => ({
    default: module.ActivityActionDialogs,
  })),
);

type ActivityActionDialogsSectionProps = {
  banDialogOpen: boolean;
  bulkDeleteDialogOpen: boolean;
  deleteDialogOpen: boolean;
  hasOpenActionDialog: boolean;
  kickDialogOpen: boolean;
  onBanConfirm: () => void | Promise<void>;
  onBanDialogOpenChange: (open: boolean) => void;
  onBulkDeleteConfirm: () => void | Promise<void>;
  onBulkDeleteDialogOpenChange: (open: boolean) => void;
  onDeleteConfirm: () => void | Promise<void>;
  onDeleteDialogOpenChange: (open: boolean) => void;
  onKickConfirm: () => void | Promise<void>;
  onKickDialogOpenChange: (open: boolean) => void;
  onUnbanConfirm: () => void | Promise<void>;
  onUnbanDialogOpenChange: (open: boolean) => void;
  selectedActivity: ActivityRecord | null;
  selectedBannedUser: BannedUser | null;
  selectedBulkCount: number;
  unbanDialogOpen: boolean;
};

export function ActivityActionDialogsSection({
  banDialogOpen,
  bulkDeleteDialogOpen,
  deleteDialogOpen,
  hasOpenActionDialog,
  kickDialogOpen,
  onBanConfirm,
  onBanDialogOpenChange,
  onBulkDeleteConfirm,
  onBulkDeleteDialogOpenChange,
  onDeleteConfirm,
  onDeleteDialogOpenChange,
  onKickConfirm,
  onKickDialogOpenChange,
  onUnbanConfirm,
  onUnbanDialogOpenChange,
  selectedActivity,
  selectedBannedUser,
  selectedBulkCount,
  unbanDialogOpen,
}: ActivityActionDialogsSectionProps) {
  if (!hasOpenActionDialog) {
    return null;
  }

  return (
    <Suspense fallback={null}>
      <ActivityActionDialogs
        banDialogOpen={banDialogOpen}
        bulkDeleteDialogOpen={bulkDeleteDialogOpen}
        deleteDialogOpen={deleteDialogOpen}
        kickDialogOpen={kickDialogOpen}
        onBanConfirm={() => void onBanConfirm()}
        onBanDialogOpenChange={onBanDialogOpenChange}
        onBulkDeleteConfirm={() => void onBulkDeleteConfirm()}
        onBulkDeleteDialogOpenChange={onBulkDeleteDialogOpenChange}
        onDeleteConfirm={() => void onDeleteConfirm()}
        onDeleteDialogOpenChange={onDeleteDialogOpenChange}
        onKickConfirm={() => void onKickConfirm()}
        onKickDialogOpenChange={onKickDialogOpenChange}
        onUnbanConfirm={() => void onUnbanConfirm()}
        onUnbanDialogOpenChange={onUnbanDialogOpenChange}
        selectedActivity={selectedActivity}
        selectedBannedUser={selectedBannedUser}
        selectedBulkCount={selectedBulkCount}
        unbanDialogOpen={unbanDialogOpen}
      />
    </Suspense>
  );
}
