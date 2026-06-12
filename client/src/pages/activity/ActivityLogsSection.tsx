import { Suspense, lazy } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ActivitySectionFallback } from "@/pages/activity/ActivityDeferredSection";
import {
  updateActivitySelection,
  updateAllVisibleActivitySelection,
} from "@/pages/activity/activity-page-content-utils";
import type {
  ActivityRecord,
  ActivitySortBy,
  ActivitySortOrder,
} from "@/pages/activity/types";

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
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  sortBy: ActivitySortBy;
  sortOrder: ActivitySortOrder;
  onBanDialogOpenChange: (open: boolean) => void;
  onDeleteDialogOpenChange: (open: boolean) => void;
  onKickDialogOpenChange: (open: boolean) => void;
  onInvestigateActivity: (activity: ActivityRecord) => void;
  onLogsOpenChange: (open: boolean) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSortChange: (sortBy: ActivitySortBy, sortOrder: ActivitySortOrder) => void;
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
  page,
  pageSize,
  totalItems,
  totalPages,
  sortBy,
  sortOrder,
  onBanDialogOpenChange,
  onDeleteDialogOpenChange,
  onKickDialogOpenChange,
  onInvestigateActivity,
  onLogsOpenChange,
  onPageChange,
  onPageSizeChange,
  onSortChange,
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
        page={page}
        pageSize={pageSize}
        totalItems={totalItems}
        totalPages={totalPages}
        sortBy={sortBy}
        sortOrder={sortOrder}
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
        onInvestigateClick={onInvestigateActivity}
        onLogsOpenChange={onLogsOpenChange}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        onSortChange={onSortChange}
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
