export const DEFAULT_COLLECTION_RECORDS_PAGE_SIZE = 50;
export const MAX_COLLECTION_RECORDS_PAGE_SIZE = 200;

export function isCollectionRecordsAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function clampCollectionRecordsPageSize(value: number) {
  return Math.max(1, Math.min(MAX_COLLECTION_RECORDS_PAGE_SIZE, Math.floor(value)));
}

export function buildCollectionRecordsPaginationState(options: {
  totalRecords: number;
  page: number;
  pageSize: number;
  recordsLength: number;
}) {
  const { totalRecords, page, pageSize, recordsLength } = options;
  const pageOffset = totalRecords === 0 ? 0 : (page - 1) * pageSize;
  const pagedStart = totalRecords === 0 ? 0 : pageOffset + 1;
  const pagedEnd = totalRecords === 0 ? 0 : Math.min(totalRecords, pageOffset + recordsLength);
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));

  return {
    pageOffset,
    pagedStart,
    pagedEnd,
    totalPages,
    hasNextPage: pagedEnd < totalRecords,
    hasPreviousPage: page > 1,
  };
}
