import { Suspense, memo, useMemo, useState } from "react";
import { Filter, RotateCcw } from "lucide-react";
import { ActiveFilterChips, type ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";
import { PanelErrorBoundary } from "@/components/PanelErrorBoundary";
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
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import { CollectionRecordsTable } from "@/pages/collection-records/CollectionRecordsTable";
import { buildCollectionRecordsPageViewModel } from "@/pages/collection-records/collection-records-page-view-models";
import { useCollectionRecordsController } from "@/pages/collection-records/useCollectionRecordsController";

const CollectionRecordsFilters = lazyWithPreload(() =>
  import("@/pages/collection-records/CollectionRecordsFilters").then((module) => ({
    default: module.CollectionRecordsFilters,
  })),
);
const CollectionRecordsToolbar = lazyWithPreload(() =>
  import("@/pages/collection-records/CollectionRecordsToolbar").then((module) => ({
    default: module.CollectionRecordsToolbar,
  })),
);
const ReceiptPreviewDialog = lazyWithPreload(() =>
  import("@/pages/collection-records/ReceiptPreviewDialog").then((module) => ({
    default: module.ReceiptPreviewDialog,
  })),
);
const EditCollectionRecordDialog = lazyWithPreload(() =>
  import("@/pages/collection-records/EditCollectionRecordDialog").then((module) => ({
    default: module.EditCollectionRecordDialog,
  })),
);
const DeleteCollectionRecordDialog = lazyWithPreload(() =>
  import("@/pages/collection-records/DeleteCollectionRecordDialog").then((module) => ({
    default: module.DeleteCollectionRecordDialog,
  })),
);
const PurgeCollectionRecordsDialog = lazyWithPreload(() =>
  import("@/pages/collection-records/PurgeCollectionRecordsDialog").then((module) => ({
    default: module.PurgeCollectionRecordsDialog,
  })),
);
const ViewAllRecordsDialog = lazyWithPreload(() =>
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
      <div className="grid gap-3 xl:grid-cols-[170px_170px_minmax(260px,1fr)_190px_auto_auto]">
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
  const controller = useCollectionRecordsController({ role });
  const viewModel = buildCollectionRecordsPageViewModel(controller);
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
    return items;
  }, [
    viewModel.filters.canUseNicknameFilter,
    viewModel.filters.fromDate,
    viewModel.filters.nicknameFilter,
    viewModel.filters.onFromDateChange,
    viewModel.filters.onNicknameFilterChange,
    viewModel.filters.onSearchInputChange,
    viewModel.filters.onToDateChange,
    viewModel.filters.searchInput,
    viewModel.filters.toDate,
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
    <div className="space-y-3">
      {isMobile ? (
        <div
          className="relative overflow-hidden rounded-[1.75rem] border border-border/60 bg-background/80 px-4 py-4 shadow-sm"
          data-floating-ai-avoid="true"
        >
          <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-br from-primary/12 via-primary/6 to-transparent" />
          <div className="relative space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Collection
              </p>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                View Rekod Collection
              </h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Search records, review receipts, and handle exports from a calmer mobile workspace.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                className="h-11 w-full justify-center rounded-2xl"
                onClick={() => setMobileFiltersOpen(true)}
              >
                <Filter className="mr-2 h-4 w-4" />
                Search & Filters
                {hasActiveFilters ? (
                  <Badge variant="secondary" className="ml-2 rounded-full px-2 py-0.5 text-[11px]">
                    {activeFilterChips.length}
                  </Badge>
                ) : null}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-2xl"
                onClick={handleMobileReset}
                disabled={!hasActiveFilters || viewModel.filters.loadingRecords}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset
              </Button>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Filters stay tucked away until you need them, so the records list remains easier to scan on
              smaller screens.
            </p>
          </div>
        </div>
      ) : null}

      <OperationalSectionCard
        title={isMobile ? "Results & Actions" : "View Rekod Collection"}
        description={
          isMobile
            ? "Review records, exports, and receipt actions without leaving the current collection view."
            : "Search, review, export, and maintain collection records from one calmer workspace."
        }
        contentClassName="space-y-3"
      >
        {!isMobile ? (
          <div className="ops-toolbar">
            <Suspense fallback={<CollectionRecordsFiltersFallback />}>
              <CollectionRecordsFilters {...viewModel.filters} />
            </Suspense>
          </div>
        ) : null}

        <ActiveFilterChips items={activeFilterChips} onClearAll={viewModel.filters.onReset} />

        <Suspense fallback={<CollectionRecordsToolbarFallback />}>
          <CollectionRecordsToolbar {...viewModel.toolbar} />
        </Suspense>

        <PanelErrorBoundary
          boundaryKey={`collection-records:${viewModel.table.visibleRecords.length}:${viewModel.filters.searchInput}:${viewModel.table.loadingRecords ? "loading" : "ready"}`}
          panelLabel="Rekod Collection"
        >
          <CollectionRecordsTable {...viewModel.table} />
        </PanelErrorBoundary>
      </OperationalSectionCard>

      {isMobile ? (
        <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[88dvh] rounded-t-[1.75rem] border-border/70 bg-background/98 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-4"
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
        <Suspense fallback={null}>
          <ReceiptPreviewDialog {...viewModel.receiptPreview} />
        </Suspense>
      ) : null}

      {viewModel.editDialog.open ? (
        <Suspense fallback={null}>
          <EditCollectionRecordDialog {...viewModel.editDialog} />
        </Suspense>
      ) : null}

      {viewModel.deleteDialog.open ? (
        <Suspense fallback={null}>
          <DeleteCollectionRecordDialog {...viewModel.deleteDialog} />
        </Suspense>
      ) : null}

      {viewModel.purgeDialog.open ? (
        <Suspense fallback={null}>
          <PurgeCollectionRecordsDialog {...viewModel.purgeDialog} />
        </Suspense>
      ) : null}

      {viewModel.viewAll.open ? (
        <Suspense fallback={null}>
          <ViewAllRecordsDialog {...viewModel.viewAll} />
        </Suspense>
      ) : null}
    </div>
  );
}

const MemoizedCollectionRecordsPage = memo(CollectionRecordsPage);
MemoizedCollectionRecordsPage.displayName = "CollectionRecordsPage";

export default MemoizedCollectionRecordsPage;
