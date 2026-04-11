import { Search } from "lucide-react";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import { Input } from "@/components/ui/input";
import { PENDING_RESET_STATUS_OPTIONS } from "@/pages/settings/account-management/pending-reset-shared";

type PendingPasswordResetFiltersPanelProps = {
  activeFilters: ActiveFilterChip[];
  hasActiveFilters: boolean;
  searchQuery: string;
  statusFilter: "all" | "active" | "pending_activation" | "suspended" | "disabled" | "locked" | "banned";
  onClearAll: () => void;
  onSearchQueryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
};

export function PendingPasswordResetFiltersPanel({
  activeFilters,
  hasActiveFilters,
  searchQuery,
  statusFilter,
  onClearAll,
  onSearchQueryChange,
  onStatusChange,
}: PendingPasswordResetFiltersPanelProps) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div className="space-y-2">
          <p className="text-sm font-medium">Search by user</p>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="pendingResetSearchQuery"
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              placeholder="Search user, username, email, or requester"
              className="pl-9"
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="pending-reset-status-filter" className="text-sm font-medium">
            Status
          </label>
          <select
            id="pending-reset-status-filter"
            name="pendingResetStatusFilter"
            value={statusFilter}
            onChange={(event) => onStatusChange(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {PENDING_RESET_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <ActiveFilterChips
        items={activeFilters}
        onClearAll={hasActiveFilters ? onClearAll : undefined}
      />
    </div>
  );
}
