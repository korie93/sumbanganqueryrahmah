import type { ActivityRecord, BannedUser } from "@/pages/activity/types";

export interface ActivityDialogActionProps {
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export interface ActivitySelectedActivityDialogProps extends ActivityDialogActionProps {
  selectedActivity: ActivityRecord | null;
}

export interface ActivityBulkDeleteDialogProps extends ActivityDialogActionProps {
  selectedBulkCount: number;
}

export interface ActivitySelectedBannedUserDialogProps extends ActivityDialogActionProps {
  selectedBannedUser: BannedUser | null;
}
