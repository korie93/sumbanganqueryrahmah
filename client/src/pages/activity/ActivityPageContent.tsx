import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { PanelErrorBoundary } from "@/components/PanelErrorBoundary";
import { ActivityActionDialogsSection } from "@/pages/activity/ActivityActionDialogsSection";
import { ActivityBannedUsersSection } from "@/pages/activity/ActivityBannedUsersSection";
import { ActivityFiltersSection } from "@/pages/activity/ActivityFiltersSection";
import { ActivityLogsSection } from "@/pages/activity/ActivityLogsSection";
import { ActivityQuickSnapshotSection } from "@/pages/activity/ActivityQuickSnapshotSection";
import type { ActivityPageContentProps } from "@/pages/activity/activity-page-content-shared";

export function ActivityPageContent({
  actionLoading,
  activities,
  allVisibleSelected,
  banDialogOpen,
  bannedUsers,
  bulkDeleteDialogOpen,
  canModerateActivity,
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
  onBanDialogOpenChange,
  onBulkDeleteDialogOpenChange,
  onDateFromOpenChange,
  onDateToOpenChange,
  onDeleteDialogOpenChange,
  onFieldChange,
  onKickDialogOpenChange,
  onLogsOpenChange,
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

      <ActivityBannedUsersSection
        actionLoading={actionLoading}
        bannedUsers={bannedUsers}
        canModerateActivity={canModerateActivity}
        onSelectBannedUser={onSelectBannedUser}
        onUnbanDialogOpenChange={onUnbanDialogOpenChange}
        shouldDeferSecondaryMobileSections={shouldDeferSecondaryMobileSections}
      />

      <PanelErrorBoundary
        boundaryKey={`activity-logs:${activities.length}:${selectedActivityIds.size}:${loading ? "loading" : "ready"}`}
        panelLabel="Activity logs"
      >
        <ActivityLogsSection
          actionLoading={actionLoading}
          activities={activities}
          allVisibleSelected={allVisibleSelected}
          canModerateActivity={canModerateActivity}
          loading={loading}
          logsOpen={logsOpen}
          onBanDialogOpenChange={onBanDialogOpenChange}
          onDeleteDialogOpenChange={onDeleteDialogOpenChange}
          onKickDialogOpenChange={onKickDialogOpenChange}
          onLogsOpenChange={onLogsOpenChange}
          onSelectActivity={onSelectActivity}
          onSetSelectedActivityIds={onSetSelectedActivityIds}
          partiallySelected={partiallySelected}
          selectedActivityIds={selectedActivityIds}
        />
      </PanelErrorBoundary>

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
