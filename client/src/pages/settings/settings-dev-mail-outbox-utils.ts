import {
  DEV_MAIL_OUTBOX_DEFAULT_PAGE_SIZE,
  DEV_MAIL_OUTBOX_MAX_PAGE_SIZE,
  type DevMailOutboxPaginationState,
  type DevMailOutboxQueryState,
} from "@/pages/settings/settings-dev-mail-outbox-shared";
import {
  isSettingsAbortError,
  normalizeSettingsPaginationState,
  normalizeSettingsPageNumber,
  normalizeSettingsPageSize,
} from "@/pages/settings/settings-request-utils";

export const isAbortError = isSettingsAbortError;

export function normalizeDevMailOutboxQuery(
  query: Partial<DevMailOutboxQueryState> | undefined,
): DevMailOutboxQueryState {
  return {
    page: normalizeSettingsPageNumber(query?.page),
    pageSize: normalizeSettingsPageSize(
      query?.pageSize,
      DEV_MAIL_OUTBOX_DEFAULT_PAGE_SIZE,
      DEV_MAIL_OUTBOX_MAX_PAGE_SIZE,
    ),
    searchEmail: String(query?.searchEmail || "").trim(),
    searchSubject: String(query?.searchSubject || "").trim(),
    sortDirection: query?.sortDirection === "asc" ? "asc" : "desc",
  };
}

export function normalizeDevMailOutboxPagination(
  pagination: Partial<DevMailOutboxPaginationState> | undefined,
  query: Pick<DevMailOutboxQueryState, "page" | "pageSize">,
): DevMailOutboxPaginationState {
  return normalizeSettingsPaginationState(pagination, query);
}
