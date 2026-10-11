import { Suspense, lazy, memo, useMemo, useRef, useState } from "react";
import { Filter } from "lucide-react";
import { ActiveFilterChips } from "@/components/data/ActiveFilterChips";
import { LazyDialogFallback } from "@/components/LazySuspenseFallback";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import { getAriaExpandedProps } from "@/lib/aria-state-props";
import { CollectionRecordsSearch } from "@/pages/collection-records/CollectionRecordsSearch";
import { buildCollectionRecordsActiveFilters } from "@/pages/collection-records/collection-record-active-filters";
import { isValidDate } from "@/pages/collection/utils";
import { CollectionRecordsTable } from "@/pages/collection-records/CollectionRecordsTable";
import { buildCollectionRecordFilterSnapshot, getCollectionRecordsRecoveryState } from "@/pages/collection-records/collection-record-filters";
import { buildCollectionRecordsPageViewModel } from "@/pages/collection-records/collection-records-page-view-models";
import { createCollectionRecordOverlayFocus } from "@/pages/collection-records/collection-record-overlay-focus";
import { useCollectionRecordsController } from "@/pages/collection-records/useCollectionRecordsController";
import { useCollectionRecordReturnHighlight } from "@/pages/collection-records/useCollectionRecordReturnHighlight";

const CollectionRecordsFilters = lazy(() =>
  import("@/pages/collection-records/CollectionRecordsFilters").then((module) => ({
    default: module.CollectionRecordsFilters,
  })),
);
const CollectionRecordsToolbar = lazy(() =>
  import("@/pages/collection-records/CollectionRecordsToolbar").then((module) => ({
    default: module.CollectionRecordsToolbar,
  })),
);
const ReceiptPreviewDialog = lazy(() =>
  import("@/pages/collection-records/ReceiptPreviewDialog").then((module) => ({
    default: module.ReceiptPreviewDialog,
  })),
);
const EditCollectionRecordDialog = lazy(() =>
  import("@/pages/collection-records/EditCollectionRecordDialog").then((module) => ({
    default: module.EditCollectionRecordDialog,
  })),
);
const DeleteCollectionRecordDialog = lazy(() =>
  import("@/pages/collection-records/DeleteCollectionRecordDialog").then((module) => ({
    default: module.DeleteCollectionRecordDialog,
  })),
);
const PurgeCollectionRecordsDialog = lazy(() =>
  import("@/pages/collection-records/PurgeCollectionRecordsDialog").then((module) => ({
    default: module.PurgeCollectionRecordsDialog,
  })),
);
const ViewAllRecordsDialog = lazy(() =>
  import("@/pages/collection-records/ViewAllRecordsDialog").then((module) => ({
    default: module.ViewAllRecordsDialog,
  })),
);

type CollectionRecordsPageProps = {
  role: string;
};

const COLLECTION_RECORDS_MOBILE_FILTER_FALLBACK_KEYS = ["date", "nickname", "source", "status"] as const;
const COLLECTION_RECORDS_DESKTOP_FILTER_FALLBACK_KEYS = [
  "from-date",
  "to-date",
  "source",
  "nickname",
  "actions",
  "summary",
] as const;
const COLLECTION_RECORDS_TOOLBAR_FALLBACK_KEYS = ["summary", "actions"] as const;

function CollectionRecordsFiltersFallback() {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <div className="space-y-3">
        {COLLECTION_RECORDS_MOBILE_FILTER_FALLBACK_KEYS.map((key) => (
          <div
            key={`collection-records-mobile-filter-fallback-${key}`}
            className="h-16 animate-pulse rounded-2xl border border-border/60 bg-muted/20"
          />
        ))}
        <div className="grid grid-cols-2 gap-2">
          <div className="h-12 animate-pulse rounded-2xl border border-border/60 bg-muted/20" />
          <div className="h-12 animate-pulse rounded-2xl border border-border/60 bg-muted/20" />
        </div>
      </div>
    );
  }

  return (
    <div className="ops-toolbar space-y-3">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,180px),1fr))] gap-3">
        {COLLECTION_RECORDS_DESKTOP_FILTER_FALLBACK_KEYS.map((key) => (
          <div
            key={`collection-records-desktop-filter-fallback-${key}`}
            className="h-16 animate-pulse rounded-xl border border-border/60 bg-muted/20"
          />
        ))}
      </div>
    </div>
  );
}

function CollectionRecordsToolbarFallback() {
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {COLLECTION_RECORDS_TOOLBAR_FALLBACK_KEYS.map((key) => (
          <div
            key={`collection-records-toolbar-fallback-${key}`}
            className="h-12 animate-pulse rounded-xl border border-border/60 bg-muted/20"
          />
        ))}
      </div>
      <div className="h-16 animate-pulse rounded-xl border border-border/60 bg-muted/20" />
    </div>
  );
}

function CollectionRecordsPage({ role }: CollectionRecordsPageProps) {
  const isMobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtersTriggerRef = useRef<HTMLButtonElement>(null);
  const pageFocusRef = useRef<HTMLDivElement>(null);
  const [overlayFocus] = useState(() => createCollectionRecordOverlayFocus(
    () => filtersTriggerRef.current ?? pageFocusRef.current,
  ));
  const controller = useCollectionRecordsController({ role });
  const viewModel = buildCollectionRecordsPageViewModel(controller);
  const recoveryState = getCollectionRecordsRecoveryState(buildCollectionRecordFilterSnapshot(viewModel.filters));
  const returnContextKey = JSON.stringify([
    role, viewModel.toolbar.tablePage, viewModel.toolbar.tablePageSize,
    viewModel.filters.fromDate, viewModel.filters.toDate, viewModel.filters.searchInput,
    viewModel.filters.nicknameFilter, viewModel.filters.leaderFilter,
    viewModel.filters.sourceImportFilter, viewModel.filters.agingFilter,
    viewModel.filters.classificationFilter, viewModel.filters.sortValue,
  ]);
  const { lastViewedRecordId, markViewed } = useCollectionRecordReturnHighlight(
    returnContextKey, viewModel.table.paginatedRecords,
  );
  const rememberReceiptLauncher = (launcher?: HTMLElement) => {
    const activeElement = document.activeElement;
    overlayFocus.remember("receipt", launcher ?? (
      activeElement instanceof HTMLElement && activeElement !== document.body ? activeElement : null
    ));
  };
  const { items: activeFilterChips, filterCount } = useMemo(
    () => buildCollectionRecordsActiveFilters(viewModel.filters), [viewModel.filters],
  );
  const focusSearch = () => {
    const searchField = document.getElementById(isMobile ? "collection-records-search-mobile" : "collection-records-search");
    (searchField ?? pageFocusRef.current)?.focus({ preventScroll: true });
  };
  const closeFilters = () => {
    setFiltersOpen(false);
    filtersTriggerRef.current?.focus({ preventScroll: true });
  };
  const handleFilter = () => {
    viewModel.filters.onFilter();
    // Keep invalid controls visible while the controller reports its validation error.
    const { fromDate, toDate } = viewModel.filters;
    if ((!fromDate || isValidDate(fromDate)) && (!toDate || isValidDate(toDate))
      && (!fromDate || !toDate || fromDate <= toDate)) closeFilters();
  };
  const handleReset = () => {
    viewModel.filters.onReset();
    closeFilters();
  };

  return (
    <div ref={pageFocusRef} tabIndex={-1} className="space-y-4" data-testid="collection-records-page">
      <section aria-label="View Rekod Collection" className="space-y-4">
        <div className="flex flex-wrap items-end gap-2" data-floating-ai-avoid="true">
          <CollectionRecordsSearch mobile={isMobile} value={viewModel.filters.searchInput} onChange={viewModel.filters.onSearchInputChange} />
          <Button
            ref={filtersTriggerRef}
            type="button"
            variant="outline"
            className="h-11 shrink-0 gap-2 rounded-md"
            data-testid="collection-records-filter-toggle"
            {...getAriaExpandedProps(filtersOpen)}
            aria-controls="collection-records-filter-panel"
            aria-haspopup={isMobile ? "dialog" : undefined}
            onClick={() => setFiltersOpen((open) => !open)}
          >
            <Filter className="h-4 w-4 shrink-0" aria-hidden="true" />
            Penapis
            {filterCount > 0 ? (
              <Badge data-testid="collection-records-filter-count" variant="secondary" className="shrink-0 rounded-full px-2 py-0.5 text-xs">
                {filterCount}
              </Badge>
            ) : null}
          </Button>
        </div>
        {!isMobile ? (
          <div
            id="collection-records-filter-panel"
            role="region"
            aria-label="Penapis rekod"
            hidden={!filtersOpen}
            onKeyDown={(event) => {
              if (event.key === "Escape" && !event.defaultPrevented && event.currentTarget.contains(event.target as Node)) {
                event.preventDefault();
                closeFilters();
              }
            }}
          >
            {filtersOpen ? (
              <Suspense fallback={<CollectionRecordsFiltersFallback />}>
                <CollectionRecordsFilters {...viewModel.filters} onFilter={handleFilter} onReset={handleReset} />
              </Suspense>
            ) : null}
          </div>
        ) : null}

        <ActiveFilterChips
          className="[&>span]:max-w-full [&>span>span]:min-w-0 [&>span>button]:shrink-0 [&_button]:min-h-8 [&_button]:min-w-8"
          items={activeFilterChips.map((item) => ({ ...item, onRemove: () => { item.onRemove?.(); focusSearch(); } }))}
          onClearAll={() => { viewModel.filters.onReset(); focusSearch(); }}
        />

        <Suspense fallback={<CollectionRecordsToolbarFallback />}>
          <CollectionRecordsToolbar {...viewModel.toolbar} />
        </Suspense>

        <CollectionRecordsTable
          {...viewModel.table}
          {...recoveryState}
          recordsLoadFailed={controller.recordsLoadFailed}
          onClearSearch={() => {
            viewModel.filters.onSearchInputChange("");
            // The recovery button disappears on refresh; retain a useful focus target.
            focusSearch();
          }}
          onResetFilters={() => {
            pageFocusRef.current?.focus({ preventScroll: true });
            viewModel.filters.onReset();
          }}
          onReloadRecords={() => {
            pageFocusRef.current?.focus({ preventScroll: true });
            viewModel.filters.onFilter();
          }}
          lastViewedRecordId={lastViewedRecordId}
          onRecordDetailsToggle={(record) => markViewed(record.id)}
          onViewReceipt={(record, launcher) => {
            rememberReceiptLauncher(launcher);
            markViewed(record.id);
            viewModel.table.onViewReceipt(record);
          }}
          onEdit={(record, launcher) => {
            const activeElement = document.activeElement;
            overlayFocus.remember("edit", launcher ?? (
              activeElement instanceof HTMLElement && activeElement !== document.body ? activeElement : null
            ));
            markViewed(record.id);
            viewModel.table.onEdit(record);
          }}
          onDelete={(record, launcher) => {
            const activeElement = document.activeElement;
            overlayFocus.remember("delete", launcher ?? (
              activeElement instanceof HTMLElement && activeElement !== document.body ? activeElement : null
            ));
            viewModel.table.onDelete(record);
          }}
        />
      </section>

      {isMobile ? (
        <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
          <SheetContent
            id="collection-records-filter-panel"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              filtersTriggerRef.current?.focus({ preventScroll: true });
            }}
            side="bottom"
            className="rounded-t-2xl border-border bg-background px-4 pb-[calc(var(--safe-area-inset-bottom)+1rem)] pt-4"
            data-floating-ai-avoid="true"
          >
            <SheetHeader className="pr-8 text-left">
              <SheetTitle>Penapis rekod</SheetTitle>
              <SheetDescription>
                Pilih penapis rekod. Pilihan dikekalkan apabila panel ditutup; Search kekal di luar panel.
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4">
              <Suspense fallback={<CollectionRecordsFiltersFallback />}>
                <CollectionRecordsFilters
                  {...viewModel.filters}
                  onFilter={handleFilter}
                  onReset={handleReset}
                />
              </Suspense>
            </div>
          </SheetContent>
        </Sheet>
      ) : null}

      {viewModel.receiptPreview.open ? (
        <Suspense fallback={<LazyDialogFallback label="Loading receipt preview dialog..." />}>
          <ReceiptPreviewDialog
            {...viewModel.receiptPreview}
            onCloseAutoFocus={(event) => overlayFocus.restore("receipt", event)}
          />
        </Suspense>
      ) : null}

      {viewModel.editDialog.open ? (
        <Suspense fallback={<LazyDialogFallback label="Loading edit collection record dialog..." />}>
          <EditCollectionRecordDialog
            {...viewModel.editDialog}
            onCloseAutoFocus={(event) => overlayFocus.restore("edit", event)}
            onViewExistingReceipt={(receipt) => {
              rememberReceiptLauncher();
              viewModel.editDialog.onViewExistingReceipt(receipt);
            }}
          />
        </Suspense>
      ) : null}

      {viewModel.deleteDialog.open ? (
        <Suspense fallback={<LazyDialogFallback label="Loading delete collection record dialog..." />}>
          <DeleteCollectionRecordDialog
            {...viewModel.deleteDialog}
            onCloseAutoFocus={(event) => overlayFocus.restore("delete", event)}
            onConfirm={() => {
              // The async refresh can remove this row after the alert closes.
              overlayFocus.remember("delete", null);
              viewModel.deleteDialog.onConfirm();
            }}
          />
        </Suspense>
      ) : null}

      {viewModel.purgeDialog.open ? (
        <Suspense fallback={<LazyDialogFallback label="Loading purge collection records dialog..." />}>
          <PurgeCollectionRecordsDialog {...viewModel.purgeDialog} />
        </Suspense>
      ) : null}

      {viewModel.viewAll.open ? (
        <Suspense fallback={<LazyDialogFallback label="Loading all collection records dialog..." />}>
          <ViewAllRecordsDialog
            {...viewModel.viewAll}
            onViewReceipt={(record) => {
              rememberReceiptLauncher();
              markViewed(record.id);
              viewModel.viewAll.onViewReceipt(record);
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}

const MemoizedCollectionRecordsPage = memo(CollectionRecordsPage);
MemoizedCollectionRecordsPage.displayName = "CollectionRecordsPage";

export default MemoizedCollectionRecordsPage;
