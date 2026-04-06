import {
  DEV_MAIL_OUTBOX_DEFAULT_PAGE_SIZE,
  DEV_MAIL_OUTBOX_MAX_PAGE_SIZE,
  type DevMailOutboxPaginationState,
  type DevMailOutboxQueryState,
} from "@/pages/settings/settings-dev-mail-outbox-shared";

export function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function normalizeDevMailOutboxQuery(
  query: Partial<DevMailOutboxQueryState> | undefined,
): DevMailOutboxQueryState {
  const page = Number(query?.page);
  const pageSize = Number(query?.pageSize);

  return {
    page: Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1,
    pageSize: Number.isFinite(pageSize)
      ? Math.max(1, Math.min(DEV_MAIL_OUTBOX_MAX_PAGE_SIZE, Math.floor(pageSize)))
      : DEV_MAIL_OUTBOX_DEFAULT_PAGE_SIZE,
    searchEmail: String(query?.searchEmail || "").trim(),
    searchSubject: String(query?.searchSubject || "").trim(),
    sortDirection: query?.sortDirection === "asc" ? "asc" : "desc",
  };
}

export function normalizeDevMailOutboxPagination(
  pagination: Partial<DevMailOutboxPaginationState> | undefined,
  query: Pick<DevMailOutboxQueryState, "page" | "pageSize">,
): DevMailOutboxPaginationState {
  return {
    page: Math.max(1, Number(pagination?.page || query.page)),
    pageSize: Math.max(1, Number(pagination?.pageSize || query.pageSize)),
    total: Math.max(0, Number(pagination?.total || 0)),
    totalPages: Math.max(1, Number(pagination?.totalPages || 1)),
  };
}
