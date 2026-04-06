import type { FilterRow, SearchResultRow } from "@/pages/general-search/types";

type SearchResponsePayload = {
  results?: SearchResultRow[];
  rows?: SearchResultRow[];
  total?: number;
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

  return { cappedTotal, nextResults };
}
