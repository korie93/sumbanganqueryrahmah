import { RefreshCw, Trash2 } from "lucide-react";
import { AppPaginationBar } from "@/components/data/AppPaginationBar";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { LocalMailOutboxDesktopTable } from "@/pages/settings/account-management/LocalMailOutboxDesktopTable";
import { LocalMailOutboxDialogs } from "@/pages/settings/account-management/LocalMailOutboxDialogs";
import { LocalMailOutboxFiltersPanel } from "@/pages/settings/account-management/LocalMailOutboxFiltersPanel";
import { LocalMailOutboxMobileList } from "@/pages/settings/account-management/LocalMailOutboxMobileList";
import type { LocalMailOutboxSectionProps } from "@/pages/settings/account-management/local-mail-outbox-shared";
import { ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE } from "@/pages/settings/account-management/utils";
import { useLocalMailOutboxState } from "@/pages/settings/account-management/useLocalMailOutboxState";

export function LocalMailOutboxSection({
  clearingDevMailOutbox,
  deletingDevMailOutboxId,
  enabled,
  entries,
  loading,
  pagination,
  query,
  onClear,
  onDeleteEntry,
  onQueryChange,
  onRefresh,
}: LocalMailOutboxSectionProps) {
  const isMobile = useIsMobile();
  const state = useLocalMailOutboxState({
    entries,
    loading,
    onQueryChange,
    query,
    total: pagination.total,
  });

  return (
    <>
      <section className="min-w-0 space-y-4" aria-label="Local Mail Outbox">
        <header className="space-y-1">
          <h2 className="text-lg font-semibold">Local Mail Outbox</h2>
          <p className="text-sm text-muted-foreground">Development email previews only. Outbox is {enabled ? "enabled" : "disabled"}; production delivery is not shown here.</p>
        </header>
        <LocalMailOutboxFiltersPanel
          actions={
          <>
            <Button variant="outline" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
              Refresh
            </Button>
            <Button
              variant="outline"
              onClick={state.openClearAllDialog}
              disabled={clearingDevMailOutbox || loading || entries.length === 0}
            >
              <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
              Delete All
            </Button>
          </>
          }
            activeFilters={state.activeFilters}
            emailQuery={state.emailQuery}
            hasActiveFilters={state.hasSearchFilter}
            sortDirection={state.sortDirection}
            subjectQuery={state.subjectQuery}
            onClearAll={state.clearSearchFilters}
            onEmailQueryChange={state.onEmailQueryChange}
            onSortDirectionChange={state.onSortDirectionChange}
            onSubjectQueryChange={state.onSubjectQueryChange}
        />
        <div className="overflow-hidden rounded-lg border border-border/70 bg-card">
          <div role="region" aria-label="Local mail preview list" tabIndex={0} className="max-h-[65vh] overflow-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring [scrollbar-gutter:stable]">
        {!enabled && pagination.total === 0 ? (
          <div className="flex min-h-[180px] items-center justify-center p-6 text-sm text-muted-foreground">
            Local development mail outbox is disabled.
          </div>
        ) : isMobile ? (
          <LocalMailOutboxMobileList
            clearingDevMailOutbox={clearingDevMailOutbox}
            deletingDevMailOutboxId={deletingDevMailOutboxId}
            emptyState={state.emptyState}
            entries={entries}
            loading={loading}
            onClearFilters={state.hasSearchFilter ? state.clearSearchFilters : undefined}
            onCopyPreviewLink={state.copyPreviewLink}
            onOpenDeleteDialog={state.openDeleteDialog}
            onOpenPreviewDialog={state.openPreviewDialog}
          />
        ) : (
          <LocalMailOutboxDesktopTable
            clearingDevMailOutbox={clearingDevMailOutbox}
            deletingDevMailOutboxId={deletingDevMailOutboxId}
            emptyState={state.emptyState}
            entries={entries}
            loading={loading}
            onClearFilters={state.hasSearchFilter ? state.clearSearchFilters : undefined}
            onCopyPreviewLink={state.copyPreviewLink}
            onOpenDeleteDialog={state.openDeleteDialog}
            onOpenPreviewDialog={state.openPreviewDialog}
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
              itemLabel="emails"
              onPageChange={(page) => onQueryChange({ page })}
              onPageSizeChange={(pageSize) => onQueryChange({ page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE, pageSize })}
            />
          </div>
        </div>
      </section>

      <LocalMailOutboxDialogs
        clearAllOpen={state.clearAllOpen}
        clearingDevMailOutbox={clearingDevMailOutbox}
        deletingDevMailOutboxId={deletingDevMailOutboxId}
        previewEntry={state.previewEntry}
        previewToDelete={state.previewToDelete}
        onClear={onClear}
        onCloseDeleteDialog={state.closeDeleteDialog}
        onClosePreviewDialog={state.closePreviewDialog}
        onDeleteEntry={onDeleteEntry}
        onSetClearAllOpen={state.setClearAllOpen}
      />
    </>
  );
}
