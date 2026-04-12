export const SETTINGS_FIRST_PAGE = 1;
export const SETTINGS_MIN_PAGE_SIZE = 1;
export const SETTINGS_EMPTY_TOTAL = 0;
export const SETTINGS_MIN_TOTAL_PAGES = 1;

type NormalizePositiveIntegerOptions = {
  max?: number;
  min?: number;
};

type SettingsPaginationShape = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

function normalizeSettingsPositiveInteger(
  value: unknown,
  fallback: number,
  options?: NormalizePositiveIntegerOptions,
) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) {
    return fallback;
  }

  const min = options?.min ?? Number.NEGATIVE_INFINITY;
  const max = options?.max ?? Number.POSITIVE_INFINITY;
  return Math.max(min, Math.min(max, Math.floor(numericValue)));
}

export function isSettingsAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function normalizeSettingsPageNumber(value: unknown, fallback = SETTINGS_FIRST_PAGE) {
  return normalizeSettingsPositiveInteger(value, fallback, {
    min: SETTINGS_FIRST_PAGE,
  });
}

export function normalizeSettingsPageSize(
  value: unknown,
  fallback: number,
  maxPageSize: number,
) {
  return normalizeSettingsPositiveInteger(value, fallback, {
    min: SETTINGS_MIN_PAGE_SIZE,
    max: maxPageSize,
  });
}

export function normalizeSettingsPaginationState(
  pagination: Partial<SettingsPaginationShape> | undefined,
  query: Pick<SettingsPaginationShape, "page" | "pageSize">,
): SettingsPaginationShape {
  return {
    page: normalizeSettingsPageNumber(pagination?.page, query.page),
    pageSize: normalizeSettingsPageNumber(pagination?.pageSize, query.pageSize),
    total: normalizeSettingsPositiveInteger(pagination?.total, SETTINGS_EMPTY_TOTAL, {
      min: SETTINGS_EMPTY_TOTAL,
    }),
    totalPages: normalizeSettingsPositiveInteger(pagination?.totalPages, SETTINGS_MIN_TOTAL_PAGES, {
      min: SETTINGS_MIN_TOTAL_PAGES,
    }),
  };
}
