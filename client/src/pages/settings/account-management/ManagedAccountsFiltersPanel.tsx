import { AlertTriangle, Search } from "lucide-react";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MANAGED_ACCOUNT_ATTENTION_FILTERS,
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
      <section
        className="rounded-lg border border-border/60 bg-muted/20 p-3"
        aria-labelledby="managed-accounts-attention-filters-title"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300" />
            <p id="managed-accounts-attention-filters-title" className="text-sm font-medium">
              Needs attention
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Jump to accounts that usually need admin action.
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {MANAGED_ACCOUNT_ATTENTION_FILTERS.map((option) => {
            const isActive = statusFilter === option.value;

            return (
              <Button
                key={option.value}
                type="button"
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => onStatusChange(isActive ? "all" : option.value)}
                className={cn(
                  "rounded-full px-3",
                  !isActive && option.value === "banned"
                    ? "text-destructive hover:text-destructive"
                    : undefined,
                  !isActive && option.value === "locked"
                    ? "text-amber-800 hover:text-amber-900 dark:text-amber-200 dark:hover:text-amber-100"
                    : undefined,
                )}
                title={option.description}
              >
                {option.label}
              </Button>
            );
          })}
        </div>
      </section>
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
