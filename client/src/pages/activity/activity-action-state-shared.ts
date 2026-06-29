import type { Dispatch, SetStateAction } from "react";
import type { ActivityBulkDeleteResponseContract } from "@shared/api-contracts";
import type { ActivityRecord, BannedUser } from "@/pages/activity/types";

export type UseActivityActionStateOptions = {
  refreshCurrentView: () => void;
  selectedActivityIds: Set<string>;
  setSelectedActivityIds: Dispatch<SetStateAction<Set<string>>>;
};

export type ActivityBulkDeleteResult = Pick<
  ActivityBulkDeleteResponseContract,
  "deletedCount" | "notFoundIds" | "protectedIds" | "requestedCount"
>;

export type ActivityActionToastPayload = {
  description: string;
  title: string;
  variant?: "default" | "destructive" | "warning";
};

export type UseActivityModerationActionHandlersOptions = UseActivityActionStateOptions & {
  selectedActivity: ActivityRecord | null;
  selectedBannedUser: BannedUser | null;
  setBanDialogOpen: Dispatch<SetStateAction<boolean>>;
  setBulkDeleteDialogOpen: Dispatch<SetStateAction<boolean>>;
  setDeleteDialogOpen: Dispatch<SetStateAction<boolean>>;
  setKickDialogOpen: Dispatch<SetStateAction<boolean>>;
  setSelectedActivity: Dispatch<SetStateAction<ActivityRecord | null>>;
  setSelectedBannedUser: Dispatch<SetStateAction<BannedUser | null>>;
  setUnbanDialogOpen: Dispatch<SetStateAction<boolean>>;
};
