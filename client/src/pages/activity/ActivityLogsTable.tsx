import { Suspense } from "react";
import { Activity as ActivityIcon } from "lucide-react";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { ActivityLogsLoadingSkeleton } from "@/pages/activity/ActivityLogsLoadingSkeleton";
import { ActivityLogsTableHeader } from "@/pages/activity/ActivityLogsTableHeader";
import { ActivityMobileLogsList } from "@/pages/activity/ActivityMobileLogsList";
import { getActivityLogsEmptyLabel } from "@/pages/activity/activity-logs-table-utils";
import type { ActivityLogsTableProps } from "@/pages/activity/types";
import { useActivityLogsLayoutPreference } from "@/pages/activity/useActivityLogsLayoutPreference";

const ActivityDesktopLogsTable = lazyWithPreload(() =>
  import("@/pages/activity/ActivityDesktopLogsTable").then((module) => ({
    default: module.ActivityDesktopLogsTable,
  })),
);

function ActivityDesktopLogsTableFallback() {
  return <ActivityLogsLoadingSkeleton />;
}

export function ActivityLogsTable({
  actionLoading,
  activities,
  canModerateActivity,
  loading,
  logsOpen,
  onBanClick,
  onDeleteClick,
  onKickClick,
  onLogsOpenChange,
  onToggleSelected,
  onToggleSelectAllVisible,
  selectedActivityIds,
  allVisibleSelected,
  partiallySelected,
}: ActivityLogsTableProps) {
  const preferMobileLayout = useActivityLogsLayoutPreference();

  return (
    <Collapsible open={logsOpen} onOpenChange={onLogsOpenChange}>
      <div className="glass-wrapper p-6" data-floating-ai-avoid="true">
        <ActivityLogsTableHeader
          activityCount={activities.length}
          logsOpen={logsOpen}
        />
        <CollapsibleContent>
          {loading ? (
            <ActivityLogsLoadingSkeleton />
          ) : activities.length === 0 ? (
            <div className="py-8 text-center">
              <ActivityIcon className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground">{getActivityLogsEmptyLabel()}</p>
            </div>
          ) : preferMobileLayout ? (
            <ActivityMobileLogsList
              actionLoading={actionLoading}
              activities={activities}
              allVisibleSelected={allVisibleSelected}
              canModerateActivity={canModerateActivity}
              onBanClick={onBanClick}
              onDeleteClick={onDeleteClick}
              onKickClick={onKickClick}
              onToggleSelected={onToggleSelected}
              onToggleSelectAllVisible={onToggleSelectAllVisible}
              partiallySelected={partiallySelected}
              selectedActivityIds={selectedActivityIds}
            />
          ) : (
            <Suspense fallback={<ActivityDesktopLogsTableFallback />}>
              <ActivityDesktopLogsTable
                actionLoading={actionLoading}
                activities={activities}
                allVisibleSelected={allVisibleSelected}
                canModerateActivity={canModerateActivity}
                onBanClick={onBanClick}
                onDeleteClick={onDeleteClick}
                onKickClick={onKickClick}
                onToggleSelected={onToggleSelected}
                onToggleSelectAllVisible={onToggleSelectAllVisible}
                partiallySelected={partiallySelected}
                selectedActivityIds={selectedActivityIds}
              />
            </Suspense>
          )}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
