import type { FilterRow, SearchResultRow } from "@/pages/general-search/types";

export const GENERAL_SEARCH_DEFAULT_PAGE_SIZE = 50;
export const GENERAL_SEARCH_LOW_SPEC_DEFAULT_PAGE_SIZE = 40;

export function shouldAutomaticallyRefreshGeneralSearch(
  searched: boolean,
  previouslySearched: boolean,
) {
  return searched && previouslySearched;
}

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

type GeneralSearchInput =
  | { mode: "simple"; query: string }
  | { mode: "advanced"; filters: FilterRow[]; logic: "AND" | "OR" };

// This identity is only held in React memory. It describes the effective search
// inputs, not a deferred draft, transient filter IDs, or a backend/cache key.
export function buildGeneralSearchInputKey(input: GeneralSearchInput): string | null {
  if (input.mode === "simple") {
    const query = input.query.trim();
    return query.length >= 2 ? JSON.stringify(["simple", query]) : null;
  }

  const filters = getValidGeneralSearchFilters(input.filters);
  if (filters.length === 0) return null;
  return JSON.stringify([
    "advanced",
    input.logic,
    filters.map(({ field, operator, value }) => [field, operator, value]),
  ]);
}

interface GeneralSearchResultStateInput {
  currentInputKey: string | null;
  successfulInputKey: string | null;
  searched: boolean;
  loading: boolean;
  error: string;
  resultCount: number;
  totalResults: number;
}

export function resolveGeneralSearchResultState({
  currentInputKey,
  successfulInputKey,
  searched,
  loading,
  error,
  resultCount,
  totalResults,
}: GeneralSearchResultStateInput) {
  // The shared feedback also reports export failures. Keep accepted populated
  // results available in that case; a new/failed search already clears its key.
  const hasCurrentSuccessfulSearch = searched && !loading
    && currentInputKey !== null && successfulInputKey === currentInputKey
    && (!error || resultCount > 0);
  return {
    hasCurrentSuccessfulSearch,
    showEmptyState: hasCurrentSuccessfulSearch && !error && resultCount === 0 && totalResults === 0,
  };
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
