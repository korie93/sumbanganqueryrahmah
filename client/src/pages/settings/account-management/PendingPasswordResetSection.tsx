import { RefreshCw } from "lucide-react";
import { AppPaginationBar } from "@/components/data/AppPaginationBar";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { PendingPasswordResetDesktopTable } from "@/pages/settings/account-management/PendingPasswordResetDesktopTable";
import { PendingPasswordResetFiltersPanel } from "@/pages/settings/account-management/PendingPasswordResetFiltersPanel";
import { PendingPasswordResetMobileList } from "@/pages/settings/account-management/PendingPasswordResetMobileList";
import type { PendingPasswordResetSectionProps } from "@/pages/settings/account-management/pending-reset-shared";
import { ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE } from "@/pages/settings/account-management/utils";
import { usePendingResetRequestsFilterState } from "@/pages/settings/account-management/usePendingResetRequestsFilterState";

export function PendingPasswordResetSection({
  loading,
  pagination,
  query,
  onQueryChange,
  onRefresh,
  requests,
}: PendingPasswordResetSectionProps) {
  const isMobile = useIsMobile();
  const filterState = usePendingResetRequestsFilterState({
    loading,
    onQueryChange,
    query,
    total: pagination.total,
  });

  return (
    <section className="min-w-0 space-y-4" aria-label="Pending Password Reset Requests">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold">Pending Password Reset Requests</h2>
        <p className="text-sm text-muted-foreground">Review only. Start a password reset from the Managed Account section after reviewing the request.</p>
      </header>
        <PendingPasswordResetFiltersPanel
          actions={<Button variant="outline" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            Refresh
          </Button>}
          activeFilters={filterState.activeFilters}
          hasActiveFilters={filterState.hasActiveFilters}
          searchQuery={filterState.searchQuery}
          statusFilter={filterState.statusFilter}
          onClearAll={filterState.clearAllFilters}
          onSearchQueryChange={filterState.onSearchQueryChange}
          onStatusChange={filterState.onStatusChange}
        />
      <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
        <div role="region" aria-label="Password reset request list" tabIndex={0} className="max-h-[65vh] overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [scrollbar-gutter:stable]">
      {isMobile ? (
        <PendingPasswordResetMobileList
          emptyState={filterState.emptyState}
          loading={loading}
          onClearFilters={filterState.hasActiveFilters ? filterState.clearAllFilters : undefined}
          requests={requests}
        />
      ) : (
        <PendingPasswordResetDesktopTable
          emptyState={filterState.emptyState}
          loading={loading}
          onClearFilters={filterState.hasActiveFilters ? filterState.clearAllFilters : undefined}
          requests={requests}
        />
      )}
        </div>
        <div className="border-t border-border/70 p-3 pr-16 [&>div]:rounded-none [&>div]:border-0 [&>div]:bg-transparent [&>div]:p-0" data-floating-ai-avoid="true">
          <AppPaginationBar
            disabled={loading}
            loading={loading}
            page={pagination.page}
            totalPages={pagination.totalPages}
            pageSize={pagination.pageSize}
            totalItems={pagination.total}
            itemLabel="requests"
            onPageChange={(page) => onQueryChange({ page })}
            onPageSizeChange={(pageSize) => onQueryChange({ page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE, pageSize })}
          />
        </div>
      </div>
    </section>
  );
}
