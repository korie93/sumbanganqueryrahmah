import type { FilterRow, SearchResultRow } from "@/pages/general-search/types";

export const GENERAL_SEARCH_DEFAULT_PAGE_SIZE = 50;
export const GENERAL_SEARCH_LOW_SPEC_DEFAULT_PAGE_SIZE = 40;

type SearchResponsePayload = {
  results?: SearchResultRow[];
  rows?: SearchResultRow[];
  total?: number;
  totalIsApproximate?: boolean | undefined;
};

export function resolveConfiguredSearchResultLimit(searchResultLimit?: number) {
  const parsed = Number(searchResultLimit);
  if (!Number.isFinite(parsed)) return 200;
  return Math.min(5000, Math.max(10, Math.floor(parsed)));
}

export function buildGeneralSearchPageSizeOptions(
  configuredSearchResultLimit: number,
  isLowSpecMode: boolean,
) {
  const base = isLowSpecMode ? [20, 40, 80] : [25, 50, 100, 200, 500, 1000];
  const withinLimit = base.filter((value) => value <= configuredSearchResultLimit);
  const withConfigured = Array.from(
    new Set([...withinLimit, configuredSearchResultLimit]),
  );
  return withConfigured.sort((left, right) => left - right);
}

export function resolveDefaultGeneralSearchPageSize(
  configuredSearchResultLimit: number,
  isLowSpecMode: boolean,
) {
  const preferredPageSize = isLowSpecMode
    ? GENERAL_SEARCH_LOW_SPEC_DEFAULT_PAGE_SIZE
    : GENERAL_SEARCH_DEFAULT_PAGE_SIZE;

  return Math.min(configuredSearchResultLimit, preferredPageSize);
}

export function clampGeneralSearchResultsPageSize(
  pageSize: number | undefined,
  configuredSearchResultLimit: number,
) {
  return Math.min(
    configuredSearchResultLimit,
    Math.max(10, Number(pageSize) || configuredSearchResultLimit),
  );
}

export function getValidGeneralSearchFilters(filters: FilterRow[]) {
  return filters.filter(
    (filter) =>
      filter.field &&
      (filter.operator === "isEmpty"
        || filter.operator === "isNotEmpty"
        || filter.value.trim()),
  );
}

export function normalizeGeneralSearchResponse(
  response: SearchResponsePayload,
  configuredSearchResultLimit: number,
) {
  const nextResults = (response.results || response.rows || []) as SearchResultRow[];
  const cappedTotal = Math.min(
    Number(response.total || nextResults.length),
    configuredSearchResultLimit,
  );
  const totalIsApproximate = Boolean(
    response.totalIsApproximate && Number(response.total || 0) < configuredSearchResultLimit,
  );

  return { cappedTotal, nextResults, totalIsApproximate };
}
