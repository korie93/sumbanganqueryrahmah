import { Suspense, lazy } from "react";
import { Activity as ActivityIcon } from "lucide-react";
import { AppPaginationBar } from "@/components/data/AppPaginationBar";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { ActivityLogsTableHeader } from "@/pages/activity/ActivityLogsTableHeader";
import { ActivityLogsToolbar } from "@/pages/activity/ActivityLogsToolbar";
import { ActivityMobileLogsList } from "@/pages/activity/ActivityMobileLogsList";
import { getActivityLogsEmptyLabel } from "@/pages/activity/activity-logs-table-utils";
import type { ActivityLogsTableProps } from "@/pages/activity/types";
import { useActivityColumnPreferences } from "@/pages/activity/useActivityColumnPreferences";
import { useActivityLogsLayoutPreference } from "@/pages/activity/useActivityLogsLayoutPreference";

const ActivityDesktopLogsTable = lazy(() =>
  import("@/pages/activity/ActivityDesktopLogsTable").then((module) => ({
    default: module.ActivityDesktopLogsTable,
  })),
);

function ActivityDesktopLogsTableFallback() {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      Loading activity table...
    </div>
  );
}

export function ActivityLogsTable({
  actionLoading,
  activities,
  canModerateActivity,
  loading,
  logsOpen,
  page,
  pageSize,
  totalItems,
  totalPages,
  sortBy,
  sortOrder,
  onBanClick,
  onDeleteClick,
  onKickClick,
  onInvestigateClick,
  onLogsOpenChange,
  onPageChange,
  onPageSizeChange,
  onSortChange,
  onToggleSelected,
  onToggleSelectAllVisible,
  selectedActivityIds,
  allVisibleSelected,
  partiallySelected,
}: ActivityLogsTableProps) {
  const preferMobileLayout = useActivityLogsLayoutPreference();
  const columnPreferences = useActivityColumnPreferences();

  return (
    <Collapsible open={logsOpen} onOpenChange={onLogsOpenChange}>
      <div className="glass-wrapper p-6" data-floating-ai-avoid="true">
        <ActivityLogsTableHeader
          totalItems={totalItems}
          logsOpen={logsOpen}
        />
        <CollapsibleContent>
          <ActivityLogsToolbar
            disabled={loading}
            page={page}
            sortBy={sortBy}
            sortOrder={sortOrder}
            totalItems={totalItems}
            totalPages={totalPages}
            columnPreferences={columnPreferences.preferences}
            showColumnControls={!preferMobileLayout}
            onMoveColumn={columnPreferences.moveColumn}
            onResetColumns={columnPreferences.resetColumns}
            onSortChange={onSortChange}
            onToggleColumn={columnPreferences.toggleColumn}
          />
          {loading ? (
            <div className="py-8 text-center">
              <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-3" />
              <p className="text-muted-foreground">Loading...</p>
            </div>
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
              onInvestigateClick={onInvestigateClick}
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
                columnPreferences={columnPreferences.preferences}
                onBanClick={onBanClick}
                onDeleteClick={onDeleteClick}
                onKickClick={onKickClick}
                onInvestigateClick={onInvestigateClick}
                onToggleSelected={onToggleSelected}
                onToggleSelectAllVisible={onToggleSelectAllVisible}
                partiallySelected={partiallySelected}
                selectedActivityIds={selectedActivityIds}
              />
            </Suspense>
          )}
          <div className="mt-4">
            <AppPaginationBar
              disabled={loading}
              loading={loading}
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={totalItems}
              itemLabel="activity logs"
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
            />
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
