import type { ActivityLogsTableProps, ActivityRecord } from "@/pages/activity/types";

export type ActivityDesktopLogsTableProps = Pick<
  ActivityLogsTableProps,
  | "actionLoading"
  | "activities"
  | "allVisibleSelected"
  | "canModerateActivity"
  | "onBanClick"
  | "onDeleteClick"
  | "onKickClick"
  | "onInvestigateClick"
  | "onToggleSelected"
  | "onToggleSelectAllVisible"
  | "partiallySelected"
  | "selectedActivityIds"
>;

export interface ActivityDesktopLogsHeaderProps {
  allVisibleSelected: boolean;
  canModerateActivity: boolean;
  gridClassName: string;
  onToggleSelectAllVisible: (checked: boolean) => void;
  partiallySelected: boolean;
}

export interface ActivityDesktopLogActionsProps {
  actionLoading: string | null;
  activity: ActivityRecord;
  onBanClick: (activity: ActivityRecord) => void;
  onDeleteClick: (activity: ActivityRecord) => void;
  onKickClick: (activity: ActivityRecord) => void;
  onInvestigateClick: (activity: ActivityRecord) => void;
}

export interface ActivityDesktopLogRowProps
  extends Pick<
    ActivityDesktopLogsTableProps,
    "actionLoading" | "canModerateActivity" | "onBanClick" | "onDeleteClick" | "onKickClick" | "onInvestigateClick"
  > {
  activity: ActivityRecord;
  gridClassName: string;
  isSelected: boolean;
  onToggleSelected: (activityId: string, checked: boolean) => void;
}
