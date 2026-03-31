export function buildViewerFooterSummary(
  pageStart: number,
  pageEnd: number,
  totalRows: number,
  filteredRowsCount: number,
  hasPageFilterSubset: boolean,
  selectedRowCount: number,
) {
  return `Showing ${pageStart}-${pageEnd} of ${totalRows} rows${hasPageFilterSubset ? ` (${filteredRowsCount} match current page filters)` : ""}${selectedRowCount > 0 ? ` (${selectedRowCount} selected)` : ""}`;
}

export function buildViewerFooterPageLabel(currentPage: number, totalPages: number) {
  return `Page ${currentPage} of ${totalPages}`;
}
