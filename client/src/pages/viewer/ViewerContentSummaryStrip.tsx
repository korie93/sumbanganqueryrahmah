type ViewerContentSummaryStripProps = {
  rowsCount: number;
  totalRows: number;
  pageStart: number;
  pageEnd: number;
  visibleHeadersCount: number;
  headersCount: number;
  selectedRowCount: number;
};

export function ViewerContentSummaryStrip({
  rowsCount,
  totalRows,
  pageStart,
  pageEnd,
  visibleHeadersCount,
  headersCount,
  selectedRowCount,
}: ViewerContentSummaryStripProps) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-2 border-y border-border py-3 text-xs leading-5" data-testid="viewer-summary">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <dt className="text-muted-foreground">Page rows</dt>
        <dd className="font-medium tabular-nums text-foreground">{rowsCount}</dd>
        <dd className="text-muted-foreground">
          {totalRows > 0 ? `Rows ${pageStart}-${pageEnd} of ${totalRows}` : "No rows loaded"}
        </dd>
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <dt className="text-muted-foreground">Visible columns</dt>
        <dd className="font-medium tabular-nums text-foreground">
          {visibleHeadersCount}/{headersCount || visibleHeadersCount}
          <span className="sr-only"> — Current table layout</span>
        </dd>
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
        <dt className="text-muted-foreground">Selected rows</dt>
        <dd className="font-medium tabular-nums text-foreground">{selectedRowCount}</dd>
        <dd className={selectedRowCount > 0 ? "text-muted-foreground" : "sr-only"}>
          {selectedRowCount > 0 ? "Ready for focused export" : "No rows selected"}
        </dd>
      </div>
    </dl>
  );
}
