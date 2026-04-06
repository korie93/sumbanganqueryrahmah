import type { Dispatch, SetStateAction } from "react";
import type { ActivityRecord, BannedUser } from "@/pages/activity/types";

export type UseActivityActionStateOptions = {
  refreshCurrentView: () => void;
  selectedActivityIds: Set<string>;
  setSelectedActivityIds: Dispatch<SetStateAction<Set<string>>>;
};

export type ActivityBulkDeleteResult = {
  deletedCount: number;
  notFoundIds: string[];
  requestedCount: number;
};

export type ActivityActionToastPayload = {
  description: string;
  title: string;
  variant?: "default" | "destructive";
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
