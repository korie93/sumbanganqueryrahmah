import { Search } from "lucide-react";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import { Input } from "@/components/ui/input";
import {
  MANAGED_ACCOUNT_ROLE_OPTIONS,
  MANAGED_ACCOUNT_STATUS_OPTIONS,
  type ManagedAccountsRoleFilter,
  type ManagedAccountsStatusFilter,
} from "@/pages/settings/account-management/managed-accounts-shared";

type ManagedAccountsFiltersPanelProps = {
  activeFilters: ActiveFilterChip[];
  hasActiveFilters: boolean;
  roleFilter: ManagedAccountsRoleFilter;
  searchQuery: string;
  statusFilter: ManagedAccountsStatusFilter;
  onClearAll: () => void;
  onRoleChange: (value: string) => void;
  onSearchQueryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
};

export function ManagedAccountsFiltersPanel({
  activeFilters,
  hasActiveFilters,
  roleFilter,
  searchQuery,
  statusFilter,
  onClearAll,
  onRoleChange,
  onSearchQueryChange,
  onStatusChange,
}: ManagedAccountsFiltersPanelProps) {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_180px]">
        <div className="space-y-2">
          <p className="text-sm font-medium">Search by user name</p>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="managedAccountsSearchQuery"
              type="search"
              value={searchQuery}
              onChange={(event) => onSearchQueryChange(event.target.value)}
              aria-label="Search by user name"
              placeholder="Search username, full name, or email"
              className="pl-9"
              enterKeyHint="search"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </div>
        <div className="space-y-2">
          <label htmlFor="managed-accounts-role-filter" className="text-sm font-medium">
            Role
          </label>
          <select
            id="managed-accounts-role-filter"
            name="managedAccountsRoleFilter"
            value={roleFilter}
            onChange={(event) => onRoleChange(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {MANAGED_ACCOUNT_ROLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor="managed-accounts-status-filter" className="text-sm font-medium">
            Status
          </label>
          <select
            id="managed-accounts-status-filter"
            name="managedAccountsStatusFilter"
            value={statusFilter}
            onChange={(event) => onStatusChange(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            {MANAGED_ACCOUNT_STATUS_OPTIONS.map((option) => (
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
