import { useId, useState } from "react";
import { Filter, RefreshCw, Search } from "lucide-react";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { getAriaExpandedProps, getAriaPressedProps } from "@/lib/aria-state-props";
import {
  MANAGED_ACCOUNT_ATTENTION_FILTERS,
  MANAGED_ACCOUNT_ROLE_OPTIONS,
  MANAGED_ACCOUNT_STATUS_OPTIONS,
  type ManagedAccountAttentionSummary,
  type ManagedAccountsRoleFilter,
  type ManagedAccountsStatusFilter,
} from "./managed-accounts-shared";
import { getManagedAccountAttentionCount } from "./managed-accounts-utils";

type ManagedAccountsFiltersPanelProps = {
  activeFilters: ActiveFilterChip[];
  attentionSummary: ManagedAccountAttentionSummary;
  hasActiveFilters: boolean;
  loading: boolean;
  roleFilter: ManagedAccountsRoleFilter;
  searchQuery: string;
  statusFilter: ManagedAccountsStatusFilter;
  onClearAll: () => void;
  onRefresh: () => void;
  onRoleChange: (value: string) => void;
  onSearchQueryChange: (value: string) => void;
  onStatusChange: (value: string) => void;
};

export function ManagedAccountsFiltersPanel({
  activeFilters, attentionSummary, hasActiveFilters, loading, roleFilter, searchQuery, statusFilter,
  onClearAll, onRefresh, onRoleChange, onSearchQueryChange, onStatusChange,
}: ManagedAccountsFiltersPanelProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterId = useId();
  const searchId = useId();
  const selectedFilterCount = Number(roleFilter !== "all") + Number(statusFilter !== "all");
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Managed account search and filters">
        <div className="relative min-w-0 basis-full sm:flex-1 sm:basis-0">
          <label className="sr-only" htmlFor={searchId}>Search accounts</label>
          <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input id={searchId} name="managedAccountsSearchQuery" type="search" value={searchQuery} onChange={(event) => onSearchQueryChange(event.target.value)} placeholder="Search username, full name, or email" className="min-h-11 bg-card pl-9 sm:min-h-10" enterKeyHint="search" autoCapitalize="none" autoCorrect="off" spellCheck={false} />
        </div>
        <Button type="button" variant="outline" className="min-h-11 bg-card sm:min-h-10" aria-label="Filter managed accounts" {...getAriaExpandedProps(filtersOpen)} aria-controls={filterId} onClick={() => setFiltersOpen((open) => !open)}>
          <Filter className="h-4 w-4" aria-hidden="true" />Filter
          {selectedFilterCount > 0 ? <span className="rounded bg-muted px-1.5 text-xs tabular-nums">{selectedFilterCount}</span> : null}
        </Button>
        <Button type="button" variant="outline" className="ml-auto min-h-11 bg-card sm:ml-0 sm:min-h-10" aria-label="Refresh managed accounts" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />Refresh
        </Button>
      </div>
      <section id={filterId} hidden={!filtersOpen} aria-label="Managed account filters" className="space-y-4 rounded-lg border border-border/70 bg-card p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="managed-accounts-role-filter" className="text-sm font-medium">Role</label>
            <select id="managed-accounts-role-filter" name="managedAccountsRoleFilter" value={roleFilter} onChange={(event) => onRoleChange(event.target.value)} className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm sm:min-h-10">
              {MANAGED_ACCOUNT_ROLE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label htmlFor="managed-accounts-status-filter" className="text-sm font-medium">Status</label>
            <select id="managed-accounts-status-filter" name="managedAccountsStatusFilter" value={statusFilter} onChange={(event) => onStatusChange(event.target.value)} className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm sm:min-h-10">
              {MANAGED_ACCOUNT_STATUS_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
        </div>
        <div className="space-y-2 border-t border-border/60 pt-3">
          <h3 className="text-sm font-medium">Needs attention</h3>
          <p className="text-xs text-muted-foreground">Counts reflect accounts on the visible page, not the whole directory.</p>
          <div className="flex flex-wrap gap-2">
            {MANAGED_ACCOUNT_ATTENTION_FILTERS.map((option) => {
              const isActive = statusFilter === option.value;
              const visibleCount = getManagedAccountAttentionCount(attentionSummary, option.value);
              return (
                <Button key={option.value} type="button" variant={isActive ? "default" : "outline"} size="sm" onClick={() => onStatusChange(isActive ? "all" : option.value)} {...getAriaPressedProps(isActive)} title={`${option.description} ${visibleCount.toLocaleString()} visible on this page.`} aria-label={`${option.label}: ${visibleCount.toLocaleString()} visible; ${option.description}`}>
                  {option.label}<span aria-hidden="true" className="tabular-nums">{visibleCount.toLocaleString()}</span>
                </Button>
              );
            })}
          </div>
        </div>
      </section>
      <ActiveFilterChips items={activeFilters} onClearAll={hasActiveFilters ? onClearAll : undefined} className="[&_button]:min-h-9 [&_button]:min-w-9" />
    </div>
  );
}
