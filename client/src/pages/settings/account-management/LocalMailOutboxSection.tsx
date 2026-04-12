import { Inbox, RefreshCw, Trash2 } from "lucide-react";
import { AppPaginationBar } from "@/components/data/AppPaginationBar";
import { SideTabDataPanel } from "@/components/layout/SideTabDataPanel";
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
      <SideTabDataPanel
        title="Local Mail Outbox"
        description="Search and manage development activation or reset emails captured locally."
        icon={Inbox}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={state.openClearAllDialog}
              disabled={clearingDevMailOutbox || loading || entries.length === 0}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete All
            </Button>
          </>
        }
        filters={
          <LocalMailOutboxFiltersPanel
            emailQuery={state.emailQuery}
            sortDirection={state.sortDirection}
            subjectQuery={state.subjectQuery}
            onEmailQueryChange={state.onEmailQueryChange}
            onSortDirectionChange={state.onSortDirectionChange}
            onSubjectQueryChange={state.onSubjectQueryChange}
          />
        }
        summary={
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
            <span className="font-medium">Total previews: {pagination.total}</span>
            <span className="text-muted-foreground">Current page: {entries.length}</span>
            <span className="text-muted-foreground">Dev outbox: {enabled ? "Enabled" : "Disabled"}</span>
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
            itemLabel="emails"
            onPageChange={(page) => {
              onQueryChange({ page });
            }}
            onPageSizeChange={(pageSize) => {
              onQueryChange({ page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE, pageSize });
            }}
          />
        }
      >
        {!enabled && pagination.total === 0 ? (
          <div className="flex h-full min-h-[240px] items-center justify-center p-6 text-sm text-muted-foreground">
            Local development mail outbox is disabled.
          </div>
        ) : isMobile ? (
          <LocalMailOutboxMobileList
            clearingDevMailOutbox={clearingDevMailOutbox}
            deletingDevMailOutboxId={deletingDevMailOutboxId}
            emptyMessage={state.emptyMessage}
            entries={entries}
            loading={loading}
            onCopyPreviewLink={state.copyPreviewLink}
            onOpenDeleteDialog={state.openDeleteDialog}
            onOpenPreviewDialog={state.openPreviewDialog}
          />
        ) : (
          <LocalMailOutboxDesktopTable
            clearingDevMailOutbox={clearingDevMailOutbox}
            deletingDevMailOutboxId={deletingDevMailOutboxId}
            emptyMessage={state.emptyMessage}
            entries={entries}
            loading={loading}
            onCopyPreviewLink={state.copyPreviewLink}
            onOpenDeleteDialog={state.openDeleteDialog}
            onOpenPreviewDialog={state.openPreviewDialog}
          />
        )}
      </SideTabDataPanel>

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
