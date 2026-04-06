import { Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import { ActivityDateRangeFields } from "@/pages/activity/ActivityDateRangeFields";
import { ActivityFilterActions } from "@/pages/activity/ActivityFilterActions";
import { ActivityStatusFilterGroup } from "@/pages/activity/ActivityStatusFilterGroup";
import { ActivityTextFiltersGrid } from "@/pages/activity/ActivityTextFiltersGrid";
import {
  getActivityFiltersPanelHeaderClassName,
  getActivityFiltersPanelTitle,
  getActivityFiltersPanelTitleClassName,
} from "@/pages/activity/activity-filters-panel-utils";
import type { ActivityFilters } from "@/lib/api";
import { STATUS_OPTIONS } from "@/pages/activity/types";

interface ActivityFiltersPanelProps {
  dateFromOpen: boolean;
  dateToOpen: boolean;
  filters: ActivityFilters;
  onApply: () => void;
  onClear: () => void;
  onDateFromOpenChange: (open: boolean) => void;
  onDateToOpenChange: (open: boolean) => void;
  onFieldChange: (field: keyof ActivityFilters, value: string) => void;
  onToggleStatus: (status: (typeof STATUS_OPTIONS)[number]["value"]) => void;
}

export function ActivityFiltersPanel({
  dateFromOpen,
  dateToOpen,
  filters,
  onApply,
  onClear,
  onDateFromOpenChange,
  onDateToOpenChange,
  onFieldChange,
  onToggleStatus,
}: ActivityFiltersPanelProps) {
  const isMobile = useIsMobile();

  return (
    <Card className="mb-6 glass-wrapper border-0" data-floating-ai-avoid="true">
      <CardHeader className={getActivityFiltersPanelHeaderClassName(isMobile)}>
        <CardTitle className={getActivityFiltersPanelTitleClassName(isMobile)}>
          <Filter className="w-5 h-5" />
          {getActivityFiltersPanelTitle(isMobile)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ActivityStatusFilterGroup
          filters={filters}
          isMobile={isMobile}
          onToggleStatus={onToggleStatus}
        />

        <ActivityTextFiltersGrid filters={filters} onFieldChange={onFieldChange} />

        <ActivityDateRangeFields
          dateFromOpen={dateFromOpen}
          dateToOpen={dateToOpen}
          filters={filters}
          onDateFromOpenChange={onDateFromOpenChange}
          onDateToOpenChange={onDateToOpenChange}
          onFieldChange={onFieldChange}
        />

        <ActivityFilterActions isMobile={isMobile} onApply={onApply} onClear={onClear} />
      </CardContent>
    </Card>
  );
}
