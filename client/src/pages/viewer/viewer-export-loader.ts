import { normalizeViewerPageResult, type ViewerPageResponse } from "@/pages/viewer/page-utils";
import type { ColumnFilter, DataRowWithId } from "@/pages/viewer/types";

type ResolveViewerImmediateExportRowsOptions = {
  rows: DataRowWithId[];
  filteredRows: DataRowWithId[];
  selectedRowIds: Set<number>;
  exportFiltered?: boolean;
  exportSelected?: boolean;
};

type LoadViewerPagedExportRowsOptions = {
  pageSize: number;
  search: string;
  columnFilters: ColumnFilter[];
  signal: AbortSignal;
  getPage: (params: {
    page: number;
    cursor?: string | undefined;
    signal: AbortSignal;
    search: string;
    columnFilters: ColumnFilter[];
  }) => Promise<ViewerPageResponse>;
};

function createAbortError() {
  return new DOMException("The operation was aborted.", "AbortError");
}

export function resolveViewerImmediateExportRows({
  rows,
  filteredRows,
  selectedRowIds,
  exportFiltered = false,
  exportSelected = false,
}: ResolveViewerImmediateExportRowsOptions) {
  if (exportSelected) {
    return rows.filter((row) => selectedRowIds.has(row.__rowId));
  }

  if (exportFiltered) {
    return filteredRows;
  }

  return rows;
}

export async function loadViewerPagedExportRows({
  pageSize,
  search,
  columnFilters,
  signal,
  getPage,
}: LoadViewerPagedExportRowsOptions) {
  const exportRows: DataRowWithId[] = [];
  let pageToLoad = 1;
  let cursorToLoad: string | null = null;

  while (true) {
    if (signal.aborted) {
      throw createAbortError();
    }

    const response = await getPage({
      page: pageToLoad,
      cursor: cursorToLoad || undefined,
      signal,
      search,
      columnFilters,
    });
    const normalizedPage = normalizeViewerPageResult(response ?? {}, pageToLoad, pageSize);

    if (normalizedPage.rows.length === 0) {
      break;
    }

    exportRows.push(...normalizedPage.rows);

    if (!normalizedPage.nextCursor) {
      break;
    }

    cursorToLoad = normalizedPage.nextCursor;
    pageToLoad = normalizedPage.page + 1;
  }

  return exportRows;
}
