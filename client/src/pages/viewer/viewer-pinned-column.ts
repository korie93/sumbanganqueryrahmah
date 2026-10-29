/** Pins are exact imported header names, limited to fields that are currently visible. */
export function resolveViewerPinnedColumn(
  column: string | null | undefined,
  visibleHeaders: readonly string[],
): string | null {
  return typeof column === "string"
    && column.trim() !== ""
    && column !== "__rowId"
    && visibleHeaders.includes(column)
    ? column
    : null;
}

/** Desktop presentation only: leave the source order intact for exports, details and mobile. */
export function getViewerDesktopHeaders(
  visibleHeaders: string[],
  pinnedColumn: string | null | undefined,
): string[] {
  const resolvedColumn = resolveViewerPinnedColumn(pinnedColumn, visibleHeaders);
  if (resolvedColumn === null || visibleHeaders[0] === resolvedColumn) return visibleHeaders;
  return [resolvedColumn, ...visibleHeaders.filter((header) => header !== resolvedColumn)];
}
