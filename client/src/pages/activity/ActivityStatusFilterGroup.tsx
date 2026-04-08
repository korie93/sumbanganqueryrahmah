import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { ActivityFilters } from "@/lib/api";
import { getActivityStatusOptionClassName } from "@/pages/activity/activity-filters-panel-utils";
import { STATUS_OPTIONS } from "@/pages/activity/types";

type ActivityStatusFilterGroupProps = {
  filters: ActivityFilters;
  isMobile: boolean;
  onToggleStatus: (status: (typeof STATUS_OPTIONS)[number]["value"]) => void;
};

export function ActivityStatusFilterGroup({
  filters,
  isMobile,
  onToggleStatus,
}: ActivityStatusFilterGroupProps) {
  return (
    <div>
      <Label className="mb-2 block text-sm font-medium">Status</Label>
      <div className={`flex flex-wrap ${isMobile ? "gap-3" : "gap-2"}`}>
        {STATUS_OPTIONS.map((option) => (
          <div key={option.value} className={getActivityStatusOptionClassName(isMobile)}>
            <Checkbox
              id={`status-${option.value}`}
              checked={filters.status?.includes(option.value) ?? false}
              onCheckedChange={() => onToggleStatus(option.value)}
              data-testid={`checkbox-status-${option.value.toLowerCase()}`}
            />
            <Label htmlFor={`status-${option.value}`} className="cursor-pointer text-sm">
              {option.label}
            </Label>
          </div>
        ))}
      </div>
    </div>
  );
}
