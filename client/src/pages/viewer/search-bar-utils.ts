export function buildViewerSearchShortcutHint() {
  return "/";
}

export function buildViewerSearchResultsSummary(
  filteredRowsCount: number,
  rowsCount: number,
) {
  return `${filteredRowsCount} shown on this page of ${rowsCount}`;
}
