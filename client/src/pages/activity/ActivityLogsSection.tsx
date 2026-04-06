import { Suspense, lazy } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ActivitySectionFallback } from "@/pages/activity/ActivityDeferredSection";
import {
  updateActivitySelection,
  updateAllVisibleActivitySelection,
} from "@/pages/activity/activity-page-content-utils";
import type { ActivityRecord } from "@/pages/activity/types";

const ActivityLogsTable = lazy(() =>
  import("@/pages/activity/ActivityLogsTable").then((module) => ({
    default: module.ActivityLogsTable,
  })),
);

type ActivityLogsSectionProps = {
  actionLoading: string | null;
  activities: ActivityRecord[];
  allVisibleSelected: boolean;
  canModerateActivity: boolean;
  loading: boolean;
  logsOpen: boolean;
  onBanDialogOpenChange: (open: boolean) => void;
  onDeleteDialogOpenChange: (open: boolean) => void;
  onKickDialogOpenChange: (open: boolean) => void;
  onLogsOpenChange: (open: boolean) => void;
  onSelectActivity: (activity: ActivityRecord | null) => void;
  onSetSelectedActivityIds: Dispatch<SetStateAction<Set<string>>>;
  partiallySelected: boolean;
  selectedActivityIds: Set<string>;
};

export function ActivityLogsSection({
  actionLoading,
  activities,
  allVisibleSelected,
  canModerateActivity,
  loading,
  logsOpen,
  onBanDialogOpenChange,
  onDeleteDialogOpenChange,
  onKickDialogOpenChange,
  onLogsOpenChange,
  onSelectActivity,
  onSetSelectedActivityIds,
  partiallySelected,
  selectedActivityIds,
}: ActivityLogsSectionProps) {
  return (
    <Suspense fallback={<ActivitySectionFallback label="Loading activity logs..." />}>
      <ActivityLogsTable
        actionLoading={actionLoading}
        activities={activities}
        allVisibleSelected={allVisibleSelected}
        canModerateActivity={canModerateActivity}
        loading={loading}
        logsOpen={logsOpen}
        onBanClick={(activity) => {
          onSelectActivity(activity);
          onBanDialogOpenChange(true);
        }}
        onDeleteClick={(activity) => {
          onSelectActivity(activity);
          onDeleteDialogOpenChange(true);
        }}
        onKickClick={(activity) => {
          onSelectActivity(activity);
          onKickDialogOpenChange(true);
        }}
        onLogsOpenChange={onLogsOpenChange}
        onToggleSelected={(activityId, checked) => {
          onSetSelectedActivityIds((previous) => updateActivitySelection(previous, activityId, checked));
        }}
        onToggleSelectAllVisible={(checked) => {
          onSetSelectedActivityIds((previous) =>
            updateAllVisibleActivitySelection(previous, activities, checked),
          );
        }}
        partiallySelected={partiallySelected}
        selectedActivityIds={selectedActivityIds}
      />
    </Suspense>
  );
}
