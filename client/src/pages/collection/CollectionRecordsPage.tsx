import { Suspense, lazy, memo, useMemo, useRef, useState } from "react";
import { Filter, RotateCcw } from "lucide-react";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/data/ActiveFilterChips";
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
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { CollectionRecordsTable } from "@/pages/collection-records/CollectionRecordsTable";
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

const COLLECTION_RECORDS_MOBILE_FILTER_FALLBACK_KEYS = ["date", "nickname", "search", "status"] as const;
const COLLECTION_RECORDS_DESKTOP_FILTER_FALLBACK_KEYS = [
  "from-date",
  "to-date",
  "search",
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
            className="h-20 animate-pulse rounded-xl border border-border/60 bg-muted/20"
          />
        ))}
      </div>
      <div className="h-28 animate-pulse rounded-xl border border-border/60 bg-muted/20" />
      <div className="h-16 animate-pulse rounded-xl border border-border/60 bg-muted/20" />
    </div>
  );
}

function CollectionRecordsPage({ role }: CollectionRecordsPageProps) {
  const isMobile = useIsMobile();
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const mobileFiltersTriggerRef = useRef<HTMLButtonElement>(null);
  const pageFocusRef = useRef<HTMLDivElement>(null);
  const [overlayFocus] = useState(() => createCollectionRecordOverlayFocus(
    () => mobileFiltersTriggerRef.current ?? pageFocusRef.current,
  ));
  const controller = useCollectionRecordsController({ role });
  const viewModel = buildCollectionRecordsPageViewModel(controller);
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
  const activeFilterChips = useMemo<ActiveFilterChip[]>(() => {
    const items: ActiveFilterChip[] = [];
    if (viewModel.filters.fromDate) {
      items.push({
        id: "collection-from-date",
        label: `From ${formatIsoDateToDDMMYYYY(viewModel.filters.fromDate)}`,
        onRemove: () => viewModel.filters.onFromDateChange(""),
      });
    }
    if (viewModel.filters.toDate) {
      items.push({
        id: "collection-to-date",
        label: `To ${formatIsoDateToDDMMYYYY(viewModel.filters.toDate)}`,
        onRemove: () => viewModel.filters.onToDateChange(""),
      });
    }
    if (viewModel.filters.searchInput.trim()) {
      items.push({
        id: "collection-search",
        label: `Search: ${viewModel.filters.searchInput.trim()}`,
        onRemove: () => viewModel.filters.onSearchInputChange(""),
      });
    }
    if (viewModel.filters.canUseNicknameFilter && viewModel.filters.nicknameFilter !== "all") {
      items.push({
        id: "collection-nickname",
        label: `Nickname: ${viewModel.filters.nicknameFilter}`,
        onRemove: () => viewModel.filters.onNicknameFilterChange("all"),
      });
    }
    if (viewModel.filters.canUseTeamLeaderFilter && viewModel.filters.leaderFilter !== "all") {
      const selectedTeam = viewModel.filters.teamOptions.find(
        (team) => team.id === viewModel.filters.leaderFilter,
      );
      items.push({
        id: "collection-team-leader",
        label: `Leader: ${selectedTeam?.leaderNickname || "Selected team"}`,
        onRemove: () => viewModel.filters.onLeaderFilterChange("all"),
      });
    }
    return items;
  }, [
    viewModel.filters,
  ]);
  const hasActiveFilters = activeFilterChips.length > 0;

  const handleMobileFilter = () => {
    viewModel.filters.onFilter();
    setMobileFiltersOpen(false);
  };

  const handleMobileReset = () => {
    viewModel.filters.onReset();
    setMobileFiltersOpen(false);
  };

  return (
    <div ref={pageFocusRef} tabIndex={-1} className="space-y-4" data-testid="collection-records-page">
      {isMobile ? (
        <div
          className="space-y-3"
          data-floating-ai-avoid="true"
        >
          <div className="relative space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                ref={mobileFiltersTriggerRef}
                type="button"
                className="h-11 min-w-0 flex-[2_1_12rem] justify-center gap-2 rounded-md"
                onClick={() => setMobileFiltersOpen(true)}
              >
                <Filter className="h-4 w-4 shrink-0" aria-hidden="true" />
                Search & Filters
                {hasActiveFilters ? (
                  <Badge variant="secondary" className="shrink-0 rounded-full px-2 py-0.5 text-2xs">
                    {activeFilterChips.length}
                  </Badge>
                ) : null}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 min-w-0 flex-[1_1_6rem] gap-2 rounded-md"
                onClick={handleMobileReset}
                disabled={!hasActiveFilters || viewModel.filters.loadingRecords}
              >
                <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
                Reset
              </Button>
            </div>

          </div>
        </div>
      ) : null}

      <section aria-label="View Rekod Collection" className="space-y-4">
        {!isMobile ? (
          <div>
            <Suspense fallback={<CollectionRecordsFiltersFallback />}>
              <CollectionRecordsFilters {...viewModel.filters} />
            </Suspense>
          </div>
        ) : null}

        <ActiveFilterChips items={activeFilterChips} onClearAll={viewModel.filters.onReset} />

        <Suspense fallback={<CollectionRecordsToolbarFallback />}>
          <CollectionRecordsToolbar {...viewModel.toolbar} />
        </Suspense>

        <CollectionRecordsTable
          {...viewModel.table}
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
        <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
          <SheetContent
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              mobileFiltersTriggerRef.current?.focus({ preventScroll: true });
            }}
            side="bottom"
            className="rounded-t-2xl border-border bg-background px-4 pb-[calc(var(--safe-area-inset-bottom)+1rem)] pt-4"
            data-floating-ai-avoid="true"
          >
            <SheetHeader className="pr-8 text-left">
              <SheetTitle>Search & Filters</SheetTitle>
              <SheetDescription>
                Narrow collection records by date, keyword, or staff nickname without losing your place in the
                results list.
              </SheetDescription>
            </SheetHeader>

            <div className="mt-4">
              <Suspense fallback={<CollectionRecordsFiltersFallback />}>
                <CollectionRecordsFilters
                  {...viewModel.filters}
                  onFilter={handleMobileFilter}
                  onReset={handleMobileReset}
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
