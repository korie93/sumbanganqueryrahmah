export function buildViewerColumnSelectorLabel(
  selectedColumnsCount: number,
  headersCount: number,
) {
  return `Columns (${selectedColumnsCount}/${headersCount})`;
}

/** Keep original positions so filtering never changes global reorder bounds. */
export function filterViewerColumnSelectorHeaders(headers: readonly string[], search: string) {
  const query = search.trim().toLowerCase();
  return headers.flatMap((header, index) =>
    !query || header.toLowerCase().includes(query) ? [{ header, index }] : []);
}
