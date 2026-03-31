export function buildViewerPageHeaderDescription(
  rowsCount: number,
  currentPage: number,
  totalPages: number,
  totalRows: number,
) {
  return `${rowsCount} row${rowsCount === 1 ? "" : "s"} on page ${currentPage} of ${totalPages} (${totalRows} total) ready for inspection, filtering, and export.`;
}

export function buildViewerFiltersButtonLabel(filterCount: number) {
  return `Filters${filterCount > 0 ? ` (${filterCount})` : ""}`;
}
