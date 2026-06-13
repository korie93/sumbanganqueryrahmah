import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ActivityActionDialogsSection } from "@/pages/activity/ActivityActionDialogsSection";
import { ActivityBannedUsersSection } from "@/pages/activity/ActivityBannedUsersSection";
import { ActivityFiltersSection } from "@/pages/activity/ActivityFiltersSection";
import { ActivityLogsSection } from "@/pages/activity/ActivityLogsSection";
import { ActivityInvestigationDrawer } from "@/pages/activity/ActivityInvestigationDrawer";
import { ActivityQuickSnapshotSection } from "@/pages/activity/ActivityQuickSnapshotSection";
import { ActivityRetentionPanel } from "@/pages/activity/ActivityRetentionPanel";
import type { ActivityPageContentProps } from "@/pages/activity/activity-page-content-shared";

export function ActivityPageContent({
  actionLoading,
  activities,
  allVisibleSelected,
  banDialogOpen,
  bannedUsers,
  bulkDeleteDialogOpen,
  canModerateActivity,
  investigatedActivity,
  investigationOpen,
  dateFromOpen,
  dateToOpen,
  deleteDialogOpen,
  errorMessage,
  filters,
  handleApplyFilters,
  handleBanConfirm,
  handleBulkDeleteConfirm,
  handleClearFilters,
  handleDeleteConfirm,
  handleKickConfirm,
  handleUnbanConfirm,
  hasOpenActionDialog,
  kickDialogOpen,
  loading,
  logsOpen,
  page,
  pageSize,
  totalItems,
  totalPages,
  sortBy,
  sortOrder,
  onBanDialogOpenChange,
  onBulkDeleteDialogOpenChange,
  onDateFromOpenChange,
  onDateToOpenChange,
  onDeleteDialogOpenChange,
  onFieldChange,
  onKickDialogOpenChange,
  onInvestigationOpenChange,
  onInvestigateActivity,
  onLogsOpenChange,
  onPageChange,
  onPageSizeChange,
  onRefreshActivity,
  onSortChange,
  onSelectActivity,
  onSelectBannedUser,
  onSetSelectedActivityIds,
  onToggleStatus,
  onUnbanDialogOpenChange,
  partiallySelected,
  selectedActivity,
  selectedActivityIds,
  selectedBannedUser,
  selectedBulkCount,
  shouldDeferSecondaryMobileSections,
  showFilters,
  summaryCounts,
  unbanDialogOpen,
}: ActivityPageContentProps) {
  return (
    <>
      <ActivityFiltersSection
        dateFromOpen={dateFromOpen}
        dateToOpen={dateToOpen}
        filters={filters}
        onApply={handleApplyFilters}
        onClear={handleClearFilters}
        onDateFromOpenChange={onDateFromOpenChange}
        onDateToOpenChange={onDateToOpenChange}
        onFieldChange={onFieldChange}
        onToggleStatus={onToggleStatus}
        showFilters={showFilters}
      />

      {errorMessage ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTitle>Aktiviti tidak dapat dimuat semula</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <ActivityQuickSnapshotSection
        bannedCount={bannedUsers.length}
        summaryCounts={summaryCounts}
      />

      {canModerateActivity ? (
        <ActivityRetentionPanel onCleanupComplete={onRefreshActivity} />
      ) : null}

      <ActivityBannedUsersSection
        actionLoading={actionLoading}
        bannedUsers={bannedUsers}
        canModerateActivity={canModerateActivity}
        onSelectBannedUser={onSelectBannedUser}
        onUnbanDialogOpenChange={onUnbanDialogOpenChange}
        shouldDeferSecondaryMobileSections={shouldDeferSecondaryMobileSections}
      />

      <ActivityLogsSection
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
        onBanDialogOpenChange={onBanDialogOpenChange}
        onDeleteDialogOpenChange={onDeleteDialogOpenChange}
        onKickDialogOpenChange={onKickDialogOpenChange}
        onInvestigateActivity={onInvestigateActivity}
        onLogsOpenChange={onLogsOpenChange}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        onSortChange={onSortChange}
        onSelectActivity={onSelectActivity}
        onSetSelectedActivityIds={onSetSelectedActivityIds}
        partiallySelected={partiallySelected}
        selectedActivityIds={selectedActivityIds}
      />

      <ActivityInvestigationDrawer
        actionLoading={actionLoading}
        activity={investigatedActivity}
        onBan={(activity) => {
          onInvestigationOpenChange(false);
          onSelectActivity(activity);
          onBanDialogOpenChange(true);
        }}
        onDelete={(activity) => {
          onInvestigationOpenChange(false);
          onSelectActivity(activity);
          onDeleteDialogOpenChange(true);
        }}
        onKick={(activity) => {
          onInvestigationOpenChange(false);
          onSelectActivity(activity);
          onKickDialogOpenChange(true);
        }}
        onOpenChange={onInvestigationOpenChange}
        onRelatedSessionsChange={onRefreshActivity}
        open={investigationOpen}
      />

      <ActivityActionDialogsSection
        banDialogOpen={banDialogOpen}
        bulkDeleteDialogOpen={bulkDeleteDialogOpen}
        deleteDialogOpen={deleteDialogOpen}
        hasOpenActionDialog={hasOpenActionDialog}
        kickDialogOpen={kickDialogOpen}
        onBanConfirm={handleBanConfirm}
        onBanDialogOpenChange={onBanDialogOpenChange}
        onBulkDeleteConfirm={handleBulkDeleteConfirm}
        onBulkDeleteDialogOpenChange={onBulkDeleteDialogOpenChange}
        onDeleteConfirm={handleDeleteConfirm}
        onDeleteDialogOpenChange={onDeleteDialogOpenChange}
        onKickConfirm={handleKickConfirm}
        onKickDialogOpenChange={onKickDialogOpenChange}
        onUnbanConfirm={handleUnbanConfirm}
        onUnbanDialogOpenChange={onUnbanDialogOpenChange}
        selectedActivity={selectedActivity}
        selectedBannedUser={selectedBannedUser}
        selectedBulkCount={selectedBulkCount}
        unbanDialogOpen={unbanDialogOpen}
      />
    </>
  );
}
