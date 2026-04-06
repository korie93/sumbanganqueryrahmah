import { ShieldOff } from "lucide-react";
import { ActivityConfirmationDialog } from "@/pages/activity/ActivityConfirmationDialog";
import { getUnbanDialogDescription } from "@/pages/activity/activity-action-dialog-utils";
import type { ActivitySelectedBannedUserDialogProps } from "@/pages/activity/activity-action-dialog-shared";

export function ActivityUnbanDialog({
  onConfirm,
  onOpenChange,
  open,
  selectedBannedUser,
}: ActivitySelectedBannedUserDialogProps) {
  return (
    <ActivityConfirmationDialog
      confirmClassName="bg-green-600 text-white"
      confirmLabel="Unban"
      description={getUnbanDialogDescription(selectedBannedUser?.username)}
      icon={<ShieldOff className="w-5 h-5 text-green-500" />}
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
      open={open}
      testId="button-confirm-unban"
      title="Unban User?"
    />
  );
}
