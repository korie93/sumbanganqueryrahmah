import { Filter, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { useAuthLocale } from "@/components/auth/useAuthLocale";
import { OperationalPageHeader } from "@/components/layout/OperationalPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getAriaExpandedProps } from "@/lib/aria-state-props";
import { getActivityFilterCount, hasActiveActivityFilters } from "@/pages/activity/utils";
import {
  getActivityAccessLabel,
  getActivityPageDescription,
} from "@/pages/activity/activity-page-utils";
import type { ActivityFilters } from "@/lib/api";

type ActivityPageHeaderProps = {
  activityCount: number;
  canModerateActivity: boolean;
  isMobile: boolean;
  loading: boolean;
  updatesPaused: boolean;
  onToggleAutomaticUpdates: () => void;
  onRefresh: () => void;
  onToggleFilters: () => void;
  selectedCount: number;
  showFilters: boolean;
  filters: ActivityFilters;
  onOpenBulkDeleteDialog: () => void;
};

export function ActivityPageHeader({
  activityCount,
  canModerateActivity,
  filters,
  isMobile,
  loading,
  updatesPaused,
  onToggleAutomaticUpdates,
  onOpenBulkDeleteDialog,
  onRefresh,
  onToggleFilters,
  selectedCount,
  showFilters,
}: ActivityPageHeaderProps) {
  const { t } = useAuthLocale();
  const UpdateIcon = updatesPaused ? Play : Pause;
  return (
    <OperationalPageHeader
      className="md:[&_.ops-page-heading]:flex-wrap md:[&_.ops-page-heading>div:first-child]:flex-[1_1_15rem] md:[&_.ops-page-heading>div:last-child]:max-w-full"
      title="Activity Monitor"
      eyebrow="Insights"
      description={getActivityPageDescription(isMobile)}
      badge={
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary" className="rounded-full px-3 py-1">
            {activityCount} matching logs
          </Badge>
          <Badge variant="outline" className="rounded-full px-3 py-1">
            {getActivityAccessLabel(canModerateActivity)}
          </Badge>
        </div>
      }
      actions={
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto [&>button]:px-2.5 sm:[&>button]:px-3">
          {canModerateActivity && selectedCount > 0 ? (
            <Button
              variant="destructive"
              onClick={onOpenBulkDeleteDialog}
              className={isMobile ? "w-full" : ""}
              data-testid="button-bulk-delete-activity"
            >
              <Trash2 aria-hidden="true" />
              Delete Selected ({selectedCount})
            </Button>
          ) : null}
          <Button
            variant={showFilters ? "default" : "outline"}
            onClick={onToggleFilters}
            className="grow shrink-0 sm:grow-0"
            {...getAriaExpandedProps(showFilters)}
            aria-controls={showFilters ? "activity-filters-panel" : undefined}
            data-testid="button-toggle-filters"
          >
            <Filter aria-hidden="true" />
            Filter
            {hasActiveActivityFilters(filters) ? (
              <Badge variant="secondary" className="ml-2">
                {getActivityFilterCount(filters)}
              </Badge>
            ) : null}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onToggleAutomaticUpdates}
            className="grow shrink-0 sm:grow-0"
            data-testid="button-toggle-activity-updates"
          >
            <UpdateIcon aria-hidden="true" className="h-4 w-4" />
            {t(updatesPaused ? "common.activity.resumeUpdates" : "common.activity.pauseUpdates")}
          </Button>
          <Button
            variant="outline"
            onClick={onRefresh}
            disabled={loading}
            className="grow shrink-0 sm:grow-0"
            data-testid="button-refresh"
          >
            <RefreshCw aria-hidden="true" className={loading ? "animate-spin motion-reduce:animate-none" : undefined} />
            Refresh
          </Button>
        </div>
      }
    />
  );
}
