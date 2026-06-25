import { ArrowUpDown } from "lucide-react";
import { ActivityColumnSelector } from "@/pages/activity/ActivityColumnSelector";
import type {
  ActivityColumnId,
  ActivityColumnPreferences,
} from "@/pages/activity/activity-column-preferences";
import type {
  ActivitySortBy,
  ActivitySortOrder,
} from "@/pages/activity/types";

const ACTIVITY_SORT_OPTIONS = [
  {
    label: "Newest login",
    value: "loginTime:desc",
    sortBy: "loginTime",
    sortOrder: "desc",
  },
  {
    label: "Oldest login",
    value: "loginTime:asc",
    sortBy: "loginTime",
    sortOrder: "asc",
  },
  {
    label: "Username A-Z",
    value: "username:asc",
    sortBy: "username",
    sortOrder: "asc",
  },
  {
    label: "Status",
    value: "status:asc",
    sortBy: "status",
    sortOrder: "asc",
  },
  {
    label: "Longest session",
    value: "duration:desc",
    sortBy: "duration",
    sortOrder: "desc",
  },
] as const satisfies ReadonlyArray<{
  label: string;
  value: string;
  sortBy: ActivitySortBy;
  sortOrder: ActivitySortOrder;
}>;

type ActivityLogsToolbarProps = {
  disabled: boolean;
  page: number;
  sortBy: ActivitySortBy;
  sortOrder: ActivitySortOrder;
  totalItems: number;
  totalPages: number;
  columnPreferences: ActivityColumnPreferences;
  showColumnControls: boolean;
  onMoveColumn: (column: ActivityColumnId, direction: -1 | 1) => void;
  onResetColumns: () => void;
  onSortChange: (sortBy: ActivitySortBy, sortOrder: ActivitySortOrder) => void;
  onToggleColumn: (column: ActivityColumnId) => void;
};

export function ActivityLogsToolbar({
  disabled,
  page,
  sortBy,
  sortOrder,
  totalItems,
  totalPages,
  columnPreferences,
  showColumnControls,
  onMoveColumn,
  onResetColumns,
  onSortChange,
  onToggleColumn,
}: ActivityLogsToolbarProps) {
  const selectedValue = `${sortBy}:${sortOrder}`;

  return (
    <div className="mb-3 flex flex-col gap-2 border-y border-border/70 bg-muted/20 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-medium text-foreground">
          {totalItems.toLocaleString()} matching record{totalItems === 1 ? "" : "s"}
        </p>
        <p className="text-2xs text-muted-foreground">
          Page {Math.max(1, page)} of {Math.max(1, totalPages)}
        </p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {showColumnControls ? (
          <ActivityColumnSelector
            preferences={columnPreferences}
            onMoveColumn={onMoveColumn}
            onReset={onResetColumns}
            onToggleColumn={onToggleColumn}
          />
        ) : null}
        <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
          <span>Sort</span>
          <select
            aria-label="Sort activity logs"
            className="h-9 w-full min-w-[170px] rounded-lg border border-input bg-background px-3 text-xs font-medium text-foreground shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-[180px]"
            data-testid="select-activity-sort"
            name="activitySort"
            value={selectedValue}
            disabled={disabled}
            onChange={(event) => {
              const value = event.target.value;
              const option = ACTIVITY_SORT_OPTIONS.find((candidate) => candidate.value === value);
              if (option) {
                onSortChange(option.sortBy, option.sortOrder);
              }
            }}
          >
            {ACTIVITY_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}
