import { LifeBuoy, RefreshCw } from "lucide-react";
import { AppPaginationBar } from "@/components/data/AppPaginationBar";
import { SideTabDataPanel } from "@/components/layout/SideTabDataPanel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { PendingPasswordResetDesktopTable } from "@/pages/settings/account-management/PendingPasswordResetDesktopTable";
import { PendingPasswordResetFiltersPanel } from "@/pages/settings/account-management/PendingPasswordResetFiltersPanel";
import { PendingPasswordResetMobileList } from "@/pages/settings/account-management/PendingPasswordResetMobileList";
import type { PendingPasswordResetSectionProps } from "@/pages/settings/account-management/pending-reset-shared";
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
    <SideTabDataPanel
      title="Pending Password Reset Requests"
      description="Review requests submitted by users before superuser-triggered password reset action."
      icon={LifeBuoy}
      actions={
        <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      }
      filters={
        <PendingPasswordResetFiltersPanel
          activeFilters={filterState.activeFilters}
          hasActiveFilters={filterState.hasActiveFilters}
          searchQuery={filterState.searchQuery}
          statusFilter={filterState.statusFilter}
          onClearAll={filterState.clearAllFilters}
          onSearchQueryChange={filterState.onSearchQueryChange}
          onStatusChange={filterState.onStatusChange}
        />
      }
      summary={
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
          <span className="font-medium">Total requests: {pagination.total}</span>
          <Badge variant="secondary">Current page {requests.length}</Badge>
        </div>
      }
      pagination={
        <AppPaginationBar
          disabled={loading}
          loading={loading}
          page={pagination.page}
          totalPages={pagination.totalPages}
          pageSize={pagination.pageSize}
          totalItems={pagination.total}
          itemLabel="requests"
          onPageChange={(page) => {
            onQueryChange({ page });
          }}
          onPageSizeChange={(pageSize) => {
            onQueryChange({
              page: 1,
              pageSize,
            });
          }}
        />
      }
    >
      {isMobile ? (
        <PendingPasswordResetMobileList
          emptyMessage={filterState.emptyMessage}
          loading={loading}
          requests={requests}
        />
      ) : (
        <PendingPasswordResetDesktopTable
          emptyMessage={filterState.emptyMessage}
          loading={loading}
          requests={requests}
        />
      )}
    </SideTabDataPanel>
  );
}
