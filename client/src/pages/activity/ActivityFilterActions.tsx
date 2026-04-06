import { Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getActivityFilterActionButtonClassName,
  getActivityFilterActionContainerClassName,
} from "@/pages/activity/activity-filters-panel-utils";

type ActivityFilterActionsProps = {
  isMobile: boolean;
  onApply: () => void;
  onClear: () => void;
};

export function ActivityFilterActions({
  isMobile,
  onApply,
  onClear,
}: ActivityFilterActionsProps) {
  const actionButtonClassName = getActivityFilterActionButtonClassName(isMobile);

  return (
    <div className={getActivityFilterActionContainerClassName(isMobile)}>
      <Button
        onClick={onApply}
        className={actionButtonClassName}
        data-testid="button-apply-filters"
      >
        <Filter className="mr-2 h-4 w-4" />
        Apply Filter
      </Button>
      <Button
        variant="outline"
        onClick={onClear}
        className={actionButtonClassName}
        data-testid="button-clear-filters"
      >
        <X className="mr-2 h-4 w-4" />
        Reset Filter
      </Button>
    </div>
  );
}
