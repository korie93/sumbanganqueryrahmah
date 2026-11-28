import { CollectionRecordCard } from "./CollectionRecordCard";
import { CollectionRecordBrowser } from "./CollectionRecordBrowser";
import { CollectionPageCheckbox } from "./CollectionSelectionCheckbox";
import { Suspense, lazy, useState } from "react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import type { CollectionRecord } from "@/lib/api";
import type { ViewCollectionReceipt } from "./types";
import { getAriaPressedProps } from "@/lib/aria-state-props";
import { CollectionRecordActions } from "./CollectionRecordActions";
import { CollectionRecordsEmptyState, type CollectionRecordsEmptyStateProps } from "./CollectionRecordsEmptyState";

const CollectionRecordsDesktopTable = lazy(() =>
  import("@/pages/collection-records/CollectionRecordsDesktopTable").then((module) => ({
    default: module.CollectionRecordsDesktopTable,
  })),
);

export interface CollectionRecordsTableProps extends CollectionRecordsEmptyStateProps {
  loadingRecords: boolean;
  visibleRecords: CollectionRecord[];
  paginatedRecords: CollectionRecord[];
  pageOffset: number;
  previousPage?: (() => void) | undefined;
  nextPage?: (() => void) | undefined;
  canEdit: boolean;
  lastViewedRecordId?: string | null | undefined;
  onViewReceipt: ViewCollectionReceipt;
  onOpenRecord?: ((record: CollectionRecord) => void) | undefined;
  onEdit: (record: CollectionRecord, launcher?: HTMLElement) => void;
  onDelete: (record: CollectionRecord, launcher?: HTMLElement) => void;
  canDeleteRow: (record: CollectionRecord) => boolean;
}

function renderRecordsLoading(label = "Loading records table...") {
  return (
    <div role="status" className="rounded-lg border border-border bg-card px-4 py-6 text-center text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function CollectionRecordsTable(props: CollectionRecordsTableProps) {
  return (
    <CollectionRecordBrowser records={props.paginatedRecords} offset={props.pageOffset}
      loading={props.loadingRecords} failed={props.recordsLoadFailed} previousPage={props.previousPage}
      nextPage={props.nextPage} onOpenRecord={props.onOpenRecord} onViewReceipt={props.onViewReceipt}>
      <CollectionRecordsTableView {...props} />
    </CollectionRecordBrowser>
  );
}

function CollectionRecordsTableView({
  loadingRecords,
  visibleRecords,
  paginatedRecords,
  pageOffset,
  canEdit,
  lastViewedRecordId = null,
  onViewReceipt,
  onOpenRecord,
  onEdit,
  onDelete,
  canDeleteRow,
  hasSearch,
  hasFilters,
  recordsLoadFailed,
  onClearSearch,
  onResetFilters,
  onReloadRecords,
}: CollectionRecordsTableProps) {
  const isMobile = useIsMobile();
  // Presentation only: never stored with user data or included in list/export requests.
  const [viewMode, setViewMode] = useState<"compact" | "full">("compact");

  if (loadingRecords) {
    return renderRecordsLoading("Loading records...");
  }

  if (visibleRecords.length === 0) {
    return <CollectionRecordsEmptyState
      hasSearch={hasSearch}
      hasFilters={hasFilters}
      recordsLoadFailed={recordsLoadFailed}
      onClearSearch={onClearSearch}
      onResetFilters={onResetFilters}
      onReloadRecords={onReloadRecords}
    />;
  }

  if (isMobile) {
    return (
      <div className="min-h-[180px] space-y-3">
        <CollectionPageCheckbox records={paginatedRecords} showLabel />
        {paginatedRecords.map((record, index) => (
          <CollectionRecordCard
            key={record.id}
            record={record}
            number={pageOffset + index + 1}
            lastViewed={record.id === lastViewedRecordId}
            onOpenRecord={onOpenRecord}
            onViewReceipt={onViewReceipt}
          >
            {canEdit || canDeleteRow(record) ? (
              <CollectionRecordActions
                record={record}
                recordNumber={pageOffset + index + 1}
                canEdit={canEdit}
                canDelete={canDeleteRow(record)}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ) : null}
          </CollectionRecordCard>
        ))}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p id="collection-records-view-hint" className="text-xs text-muted-foreground">
          Ringkas untuk semakan harian. Lengkap untuk semua kolum. Eksport kekal lengkap.
        </p>
        <div role="group" aria-label="Paparan rekod" aria-describedby="collection-records-view-hint" className="flex shrink-0 gap-1">
          <Button type="button" variant={viewMode === "compact" ? "secondary" : "ghost"}
            className="min-h-11 sm:min-h-11" {...getAriaPressedProps(viewMode === "compact")}
            onClick={() => setViewMode("compact")}>
            Ringkas
          </Button>
          <Button type="button" variant={viewMode === "full" ? "secondary" : "ghost"}
            className="min-h-11 sm:min-h-11" {...getAriaPressedProps(viewMode === "full")}
            onClick={() => setViewMode("full")}>
            Lengkap
          </Button>
        </div>
      </div>
    <Suspense fallback={renderRecordsLoading()}>
      <CollectionRecordsDesktopTable
        viewMode={viewMode}
        loadingRecords={loadingRecords}
        visibleRecords={visibleRecords}
        paginatedRecords={paginatedRecords}
        pageOffset={pageOffset}
        canEdit={canEdit}
        lastViewedRecordId={lastViewedRecordId}
        onOpenRecord={onOpenRecord}
        onViewReceipt={onViewReceipt}
        onEdit={onEdit}
        onDelete={onDelete}
        canDeleteRow={canDeleteRow}
      />
    </Suspense>
    </div>
  );
}
