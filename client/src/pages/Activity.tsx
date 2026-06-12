import { OperationalPage } from "@/components/layout/OperationalPage";
import { ActivityPageContent } from "@/pages/activity/ActivityPageContent";
import { ActivityPageHeader } from "@/pages/activity/ActivityPageHeader";
import { useActivityPageState } from "@/pages/activity/useActivityPageState";
import {
  hasActiveActivityFilters,
} from "@/pages/activity/utils";

export default function Activity() {
  const {
    isMobile,
    shouldDeferSecondaryMobileSections,
    canModerateActivity,
    activities,
    bannedUsers,
    errorMessage,
    loading,
    actionLoading,
    kickDialogOpen,
    setKickDialogOpen,
    banDialogOpen,
    setBanDialogOpen,
    unbanDialogOpen,
    setUnbanDialogOpen,
    deleteDialogOpen,
    setDeleteDialogOpen,
    bulkDeleteDialogOpen,
    setBulkDeleteDialogOpen,
    selectedActivity,
    setSelectedActivity,
    selectedBannedUser,
    setSelectedBannedUser,
    selectedActivityIds,
    setSelectedActivityIds,
    showFilters,
    setShowFilters,
    filters,
    setFilters,
    dateFromOpen,
    setDateFromOpen,
    dateToOpen,
    setDateToOpen,
    logsOpen,
    setLogsOpen,
    requestActivityPage,
    refreshCurrentView,
    page,
    pageSize,
    totalItems,
    totalPages,
    sortBy,
    sortOrder,
    handlePageChange,
    handlePageSizeChange,
    handleSortChange,
    handleApplyFilters,
    handleClearFilters,
    toggleStatusFilter,
    handleKickConfirm,
    handleBanConfirm,
    handleDeleteConfirm,
    handleBulkDeleteConfirm,
    handleUnbanConfirm,
    summaryCounts,
    allVisibleSelected,
    partiallySelected,
    hasOpenActionDialog,
  } = useActivityPageState();

  return (
    <OperationalPage width="content">
      <ActivityPageHeader
        activityCount={totalItems}
        canModerateActivity={canModerateActivity}
        filters={filters}
        isMobile={isMobile}
        loading={loading}
        onOpenBulkDeleteDialog={() => setBulkDeleteDialogOpen(true)}
        onRefresh={() => requestActivityPage(hasActiveActivityFilters(filters))}
        onToggleFilters={() => setShowFilters((previous) => !previous)}
        selectedCount={selectedActivityIds.size}
        showFilters={showFilters}
      />
      <ActivityPageContent
        actionLoading={actionLoading}
        activities={activities}
        allVisibleSelected={allVisibleSelected}
        banDialogOpen={banDialogOpen}
        bannedUsers={bannedUsers}
        bulkDeleteDialogOpen={bulkDeleteDialogOpen}
        canModerateActivity={canModerateActivity}
        dateFromOpen={dateFromOpen}
        dateToOpen={dateToOpen}
        deleteDialogOpen={deleteDialogOpen}
        errorMessage={errorMessage}
        filters={filters}
        handleApplyFilters={handleApplyFilters}
        handleBanConfirm={handleBanConfirm}
        handleBulkDeleteConfirm={handleBulkDeleteConfirm}
        handleClearFilters={handleClearFilters}
        handleDeleteConfirm={handleDeleteConfirm}
        handleKickConfirm={handleKickConfirm}
        handleUnbanConfirm={handleUnbanConfirm}
        hasOpenActionDialog={hasOpenActionDialog}
        kickDialogOpen={kickDialogOpen}
        loading={loading}
        logsOpen={logsOpen}
        page={page}
        pageSize={pageSize}
        totalItems={totalItems}
        totalPages={totalPages}
        sortBy={sortBy}
        sortOrder={sortOrder}
        onBanDialogOpenChange={setBanDialogOpen}
        onBulkDeleteDialogOpenChange={setBulkDeleteDialogOpen}
        onDateFromOpenChange={setDateFromOpen}
        onDateToOpenChange={setDateToOpen}
        onDeleteDialogOpenChange={setDeleteDialogOpen}
        onFieldChange={(field, value) =>
          setFilters((previous) => ({ ...previous, [field]: value }))
        }
        onKickDialogOpenChange={setKickDialogOpen}
        onLogsOpenChange={setLogsOpen}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
        onRefreshActivity={refreshCurrentView}
        onSortChange={handleSortChange}
        onSelectActivity={setSelectedActivity}
        onSelectBannedUser={setSelectedBannedUser}
        onSetSelectedActivityIds={setSelectedActivityIds}
        onToggleStatus={toggleStatusFilter}
        onUnbanDialogOpenChange={setUnbanDialogOpen}
        partiallySelected={partiallySelected}
        selectedActivity={selectedActivity}
        selectedActivityIds={selectedActivityIds}
        selectedBannedUser={selectedBannedUser}
        selectedBulkCount={selectedActivityIds.size}
        shouldDeferSecondaryMobileSections={shouldDeferSecondaryMobileSections}
        showFilters={showFilters}
        summaryCounts={summaryCounts}
        unbanDialogOpen={unbanDialogOpen}
      />
    </OperationalPage>
  );
}
