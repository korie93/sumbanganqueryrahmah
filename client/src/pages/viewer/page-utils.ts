import type { ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import type { ColumnFilter, DataRowWithId } from "@/pages/viewer/types";
import { extractHeadersFromRows } from "@/pages/viewer/utils";

export const VIEWER_FILTER_OPERATOR_LABELS: Record<ColumnFilter["operator"], string> = {
  contains: "contains",
  equals: "is",
  startsWith: "starts with",
  endsWith: "ends with",
  notEquals: "is not",
};

type ViewerApiRow = {
  jsonDataJsonb?: Record<string, unknown> | undefined;
};

export type ViewerPageResponse = {
  rows?: ViewerApiRow[] | undefined;
  headers?: string[] | undefined;
  total?: number | undefined;
  page?: number | undefined;
  limit?: number | undefined;
  pageSize?: number | undefined;
  nextCursor?: string | null | undefined;
};

export function resolveViewerImportName(
  storage: Pick<Storage, "getItem"> | null | undefined =
    typeof localStorage !== "undefined" ? localStorage : null,
) {
  return (
    storage?.getItem("selectedImportName") ||
    storage?.getItem("analysisImportName") ||
    "Data Viewer"
  );
}

export function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function normalizeViewerPageResult(
  response: ViewerPageResponse,
  requestedPage: number,
  fallbackLimit: number,
): {
  rows: DataRowWithId[];
  total: number;
  page: number;
  limit: number;
  nextCursor: string | null;
} {
  const page = Number.isFinite(Number(response?.page))
    ? Math.max(1, Math.trunc(Number(response?.page)))
    : requestedPage;
  const limit = Number.isFinite(Number(response?.pageSize))
    ? Math.max(1, Math.trunc(Number(response?.pageSize)))
    : Number.isFinite(Number(response?.limit))
      ? Math.max(1, Math.trunc(Number(response?.limit)))
    : fallbackLimit;
  const total = Number.isFinite(Number(response?.total))
    ? Math.max(0, Math.trunc(Number(response?.total)))
    : 0;
  const pageBase = (page - 1) * limit;
  const apiRows = Array.isArray(response?.rows) ? response.rows : [];

  return {
    rows: apiRows.map((row, index) => ({
      ...(row.jsonDataJsonb ?? {}),
      __rowId: pageBase + index,
    })),
    total,
    page,
    limit,
    nextCursor: typeof response?.nextCursor === "string" ? response.nextCursor : null,
  };
}

export function resolveViewerPageHeaders(
  response: ViewerPageResponse,
  fallbackRows: DataRowWithId[] = [],
) {
  const apiHeaders = Array.isArray(response?.headers)
    ? response.headers
        .map((header) => (typeof header === "string" ? header.trim() : ""))
        .filter(Boolean)
    : [];

  if (apiHeaders.length > 0) {
    return Array.from(new Set(apiHeaders));
  }

  return extractHeadersFromRows(fallbackRows);
}

interface BuildViewerActiveFilterChipsOptions {
  search: string;
  activeColumnFilters: ColumnFilter[];
  onClearSearch: () => void;
  onRemoveFilter: (index: number) => void;
}

export function buildViewerActiveFilterChips({
  search,
  activeColumnFilters,
  onClearSearch,
  onRemoveFilter,
}: BuildViewerActiveFilterChipsOptions): ActiveFilterChip[] {
  const items: ActiveFilterChip[] = [];
  const trimmedSearch = search.trim();

  if (trimmedSearch) {
    items.push({
      id: "viewer-search",
      label: `Search: ${trimmedSearch}`,
      onRemove: onClearSearch,
    });
  }

  activeColumnFilters.forEach((filter, index) => {
    items.push({
      id: `viewer-filter-${index}`,
      label: `${filter.column} ${VIEWER_FILTER_OPERATOR_LABELS[filter.operator]} ${filter.value}`,
      onRemove: () => onRemoveFilter(index),
    });
  });

  return items;
}
