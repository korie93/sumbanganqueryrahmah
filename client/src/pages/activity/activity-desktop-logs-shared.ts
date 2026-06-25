import type { ActivityLogsTableProps, ActivityRecord } from "@/pages/activity/types";
import type {
  ActivityColumnId,
  ActivityColumnPreferences,
} from "@/pages/activity/activity-column-preferences";
import type { TableDensity } from "@/hooks/usePersistentTableDensity";

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
> & {
  columnPreferences: ActivityColumnPreferences;
  density: TableDensity;
};

export interface ActivityDesktopLogsHeaderProps {
  allVisibleSelected: boolean;
  canModerateActivity: boolean;
  columns: ActivityColumnId[];
  density: TableDensity;
  gridTemplateColumns: string;
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
  columns: ActivityColumnId[];
  density: TableDensity;
  gridTemplateColumns: string;
  isSelected: boolean;
  onToggleSelected: (activityId: string, checked: boolean) => void;
}
