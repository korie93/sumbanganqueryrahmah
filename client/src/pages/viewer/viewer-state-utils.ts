import type { ColumnFilter, DataRowWithId } from "@/pages/viewer/types";

export function getViewerActiveColumnFilters(columnFilters: ColumnFilter[]) {
  return columnFilters.filter((filter) => {
    const normalizedValue = filter.value.trim();
    return filter.column.trim() !== "" && normalizedValue !== "";
  });
}

export function getViewerVisibleHeaders(headers: string[], selectedColumns: Set<string>) {
  return headers.filter((header) => selectedColumns.has(header));
}

export function getViewerVirtualTableMinWidth(visibleHeaderCount: number) {
  return Math.max(900, 100 + visibleHeaderCount * 180);
}

export function getViewerGridTemplateColumns(visibleHeaderCount: number) {
  return `44px 56px repeat(${Math.max(1, visibleHeaderCount)}, minmax(180px, 1fr))`;
}

export function getViewerPageMetrics(params: {
  totalRows: number;
  currentPage: number;
  currentPageSize: number;
  loadedRowsCount: number;
  nextCursor: string | null;
}) {
  const totalPages = Math.max(1, Math.ceil(params.totalRows / Math.max(1, params.currentPageSize)));
  const pageStart = params.totalRows === 0 ? 0 : (params.currentPage - 1) * params.currentPageSize + 1;
  const pageEnd =
    params.totalRows === 0
      ? 0
      : Math.min(params.totalRows, pageStart + params.loadedRowsCount - 1);

  return {
    totalPages,
    pageStart,
    pageEnd,
    hasPreviousPage: params.currentPage > 1,
    hasNextPage: params.nextCursor !== null,
  };
}

export function pruneViewerSelectedRowIds(previous: Set<number>, rows: DataRowWithId[]) {
  if (previous.size === 0) {
    return previous;
  }

  const availableIds = new Set(rows.map((row) => row.__rowId));
  let changed = false;
  const next = new Set<number>();

  previous.forEach((id) => {
    if (availableIds.has(id)) {
      next.add(id);
    } else {
      changed = true;
    }
  });

  return changed ? next : previous;
}

export function toggleViewerColumnSelection(previous: Set<string>, column: string) {
  const next = new Set(previous);
  if (next.has(column)) {
    if (next.size > 1) {
      next.delete(column);
    }
  } else {
    next.add(column);
  }
  return next;
}

export function deselectViewerColumns(headers: string[]) {
  return headers.length > 0 ? new Set([headers[0]]) : new Set<string>();
}

export function toggleViewerRowSelection(previous: Set<number>, rowId: number) {
  const next = new Set(previous);
  if (next.has(rowId)) {
    next.delete(rowId);
  } else {
    next.add(rowId);
  }
  return next;
}

export function getViewerSelectAllFilteredRowIds(filteredRows: DataRowWithId[]) {
  return new Set(filteredRows.map((row) => row.__rowId));
}
