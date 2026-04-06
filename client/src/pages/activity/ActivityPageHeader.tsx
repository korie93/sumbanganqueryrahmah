import { Filter, RefreshCw, Trash2 } from "lucide-react";
import { OperationalPageHeader } from "@/components/layout/OperationalPage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
            {activityCount} visible logs
          </Badge>
          <Badge variant="outline" className="rounded-full px-3 py-1">
            {getActivityAccessLabel(canModerateActivity)}
          </Badge>
        </div>
      }
      actions={
        <>
          {canModerateActivity && selectedCount > 0 ? (
            <Button
              variant="destructive"
              onClick={onOpenBulkDeleteDialog}
              className={isMobile ? "w-full" : undefined}
              data-testid="button-bulk-delete-activity"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete Selected ({selectedCount})
            </Button>
          ) : null}
          <Button
            variant={showFilters ? "default" : "outline"}
            onClick={onToggleFilters}
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
            onClick={onRefresh}
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
  );
}
