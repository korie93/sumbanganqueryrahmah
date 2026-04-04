import { Suspense, lazy } from "react";
import { Filter, RefreshCw, Trash2 } from "lucide-react";
import {
  OperationalPage,
  OperationalPageHeader,
  OperationalSectionCard,
} from "@/components/layout/OperationalPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ActivitySectionFallback, useDeferredActivitySectionMount } from "@/pages/activity/ActivityDeferredSection";
import { ActivitySummaryCards } from "@/pages/activity/ActivitySummaryCards";
import { useActivityPageState } from "@/pages/activity/useActivityPageState";
import {
  getActivityFilterCount,
  hasActiveActivityFilters,
} from "@/pages/activity/utils";

const ActivityActionDialogs = lazy(() =>
  import("@/pages/activity/ActivityActionDialogs").then((module) => ({
    default: module.ActivityActionDialogs,
  })),
);
const ActivityLogsTable = lazy(() =>
  import("@/pages/activity/ActivityLogsTable").then((module) => ({
    default: module.ActivityLogsTable,
  })),
);
const ActivityBannedUsersPanel = lazy(() =>
  import("@/pages/activity/ActivityBannedUsersPanel").then((module) => ({
    default: module.ActivityBannedUsersPanel,
  })),
);
const ActivityFiltersPanel = lazy(() =>
  import("@/pages/activity/ActivityFiltersPanel").then((module) => ({
    default: module.ActivityFiltersPanel,
  })),
);

export default function Activity() {
  const {
    isMobile,
    shouldDeferSecondaryMobileSections,
    canModerateActivity,
    activities,
    bannedUsers,
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
    fetchActivities,
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
  const bannedUsersSection = useDeferredActivitySectionMount({
    enabled: shouldDeferSecondaryMobileSections,
    rootMargin: "160px 0px",
    timeoutMs: 700,
  });

  return (
    <OperationalPage width="content">
      <OperationalPageHeader
        title="Activity Monitor"
        eyebrow="Insights"
        description={
          isMobile
            ? "Monitor user activity and moderation events in real-time."
            : "Monitor user activity, moderation events, and session visibility in real-time."
        }
        badge={
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="rounded-full px-3 py-1">
              {activities.length} visible logs
            </Badge>
            <Badge variant="outline" className="rounded-full px-3 py-1">
              {canModerateActivity ? "Moderation enabled" : "Read-only view"}
            </Badge>
          </div>
        }
        actions={
          <>
            {canModerateActivity && selectedActivityIds.size > 0 ? (
              <Button
                variant="destructive"
                onClick={() => setBulkDeleteDialogOpen(true)}
                className={isMobile ? "w-full" : undefined}
                data-testid="button-bulk-delete-activity"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Selected ({selectedActivityIds.size})
              </Button>
            ) : null}
            <Button
              variant={showFilters ? "default" : "outline"}
              onClick={() => setShowFilters((previous) => !previous)}
              className={isMobile ? "w-full" : undefined}
              data-testid="button-toggle-filters"
            >
              <Filter className="w-4 h-4 mr-2" />
              Filter
              {hasActiveActivityFilters(filters) ? (
                <Badge variant="secondary" className="ml-2">
                  {getActivityFilterCount(filters)}
                </Badge>
              ) : null}
            </Button>
            <Button
              variant="outline"
              onClick={() => void fetchActivities(hasActiveActivityFilters(filters))}
              disabled={loading}
              className={isMobile ? "w-full" : undefined}
              data-testid="button-refresh"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </>
        }
        className={isMobile ? "rounded-[28px] border-border/60 bg-background/85" : undefined}
      />

      {showFilters ? (
        <Suspense fallback={<ActivitySectionFallback label="Loading activity filters..." />}>
          <ActivityFiltersPanel
            dateFromOpen={dateFromOpen}
            dateToOpen={dateToOpen}
            filters={filters}
            onApply={handleApplyFilters}
            onClear={handleClearFilters}
            onDateFromOpenChange={setDateFromOpen}
            onDateToOpenChange={setDateToOpen}
            onFieldChange={(field, value) => setFilters((previous) => ({ ...previous, [field]: value }))}
            onToggleStatus={toggleStatusFilter}
          />
        </Suspense>
      ) : null}

      <OperationalSectionCard
        title="Quick Snapshot"
        description="Live user presence, idle sessions, forced exits, and banned accounts in one shared admin summary strip."
        contentClassName="space-y-0"
      >
        <ActivitySummaryCards
          bannedCount={bannedUsers.length}
          className="mb-0"
          idleCount={summaryCounts.idleCount}
          kickedCount={summaryCounts.kickedCount}
          logoutCount={summaryCounts.logoutCount}
          onlineCount={summaryCounts.onlineCount}
        />
      </OperationalSectionCard>

      {canModerateActivity && bannedUsers.length > 0 ? (
        <div ref={bannedUsersSection.triggerRef}>
          {bannedUsersSection.shouldRender ? (
            <Suspense fallback={<ActivitySectionFallback label="Loading banned users..." />}>
              <ActivityBannedUsersPanel
                actionLoading={actionLoading}
                bannedUsers={bannedUsers}
                onUnbanClick={(user) => {
                  setSelectedBannedUser(user);
                  setUnbanDialogOpen(true);
                }}
              />
            </Suspense>
          ) : (
            <ActivitySectionFallback label="Banned users will load as you scroll." />
          )}
        </div>
      ) : null}

      <Suspense fallback={<ActivitySectionFallback label="Loading activity logs..." />}>
        <ActivityLogsTable
          actionLoading={actionLoading}
          activities={activities}
          canModerateActivity={canModerateActivity}
          loading={loading}
          logsOpen={logsOpen}
          onBanClick={(activity) => {
            setSelectedActivity(activity);
            setBanDialogOpen(true);
          }}
          onDeleteClick={(activity) => {
            setSelectedActivity(activity);
            setDeleteDialogOpen(true);
          }}
          onKickClick={(activity) => {
            setSelectedActivity(activity);
            setKickDialogOpen(true);
          }}
          onLogsOpenChange={setLogsOpen}
          onToggleSelected={(activityId, checked) => {
            setSelectedActivityIds((previous) => {
              const next = new Set(previous);
              if (checked) {
                next.add(activityId);
              } else {
                next.delete(activityId);
              }
              return next;
            });
          }}
          onToggleSelectAllVisible={(checked) => {
            setSelectedActivityIds((previous) => {
              const next = new Set(previous);
              for (const activity of activities) {
                if (checked) {
                  next.add(activity.id);
                } else {
                  next.delete(activity.id);
                }
              }
              return next;
            });
          }}
          selectedActivityIds={selectedActivityIds}
          allVisibleSelected={allVisibleSelected}
          partiallySelected={partiallySelected}
        />
      </Suspense>

      {hasOpenActionDialog ? (
        <Suspense fallback={null}>
          <ActivityActionDialogs
            banDialogOpen={banDialogOpen}
            bulkDeleteDialogOpen={bulkDeleteDialogOpen}
            deleteDialogOpen={deleteDialogOpen}
            kickDialogOpen={kickDialogOpen}
            onBanConfirm={() => void handleBanConfirm()}
            onBanDialogOpenChange={setBanDialogOpen}
            onDeleteConfirm={() => void handleDeleteConfirm()}
            onDeleteDialogOpenChange={setDeleteDialogOpen}
            onBulkDeleteConfirm={() => void handleBulkDeleteConfirm()}
            onBulkDeleteDialogOpenChange={setBulkDeleteDialogOpen}
            onKickConfirm={() => void handleKickConfirm()}
            onKickDialogOpenChange={setKickDialogOpen}
            onUnbanConfirm={() => void handleUnbanConfirm()}
            onUnbanDialogOpenChange={setUnbanDialogOpen}
            selectedActivity={selectedActivity}
            selectedBannedUser={selectedBannedUser}
            selectedBulkCount={selectedActivityIds.size}
            unbanDialogOpen={unbanDialogOpen}
          />
        </Suspense>
      ) : null}
    </OperationalPage>
  );
}
