import { Filter, RefreshCw, Trash2 } from "lucide-react";
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
  onOpenBulkDeleteDialog,
  onRefresh,
  onToggleFilters,
  selectedCount,
  showFilters,
}: ActivityPageHeaderProps) {
  return (
    <OperationalPageHeader
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
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          {canModerateActivity && selectedCount > 0 ? (
            <Button
              variant="destructive"
              onClick={onOpenBulkDeleteDialog}
              className={isMobile ? "w-full" : ""}
              data-testid="button-bulk-delete-activity"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Selected ({selectedCount})
            </Button>
          ) : null}
          <Button
            variant={showFilters ? "default" : "outline"}
            onClick={onToggleFilters}
            className="flex-1 sm:flex-none"
            {...getAriaExpandedProps(showFilters)}
            aria-controls={showFilters ? "activity-filters-panel" : undefined}
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
            onClick={onRefresh}
            disabled={loading}
            className="flex-1 sm:flex-none"
            data-testid="button-refresh"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      }
    />
  );
}
