import {
  MANAGED_USERS_DEFAULT_PAGE_SIZE,
  MANAGED_USERS_MAX_PAGE_SIZE,
  PENDING_RESET_REQUESTS_DEFAULT_PAGE_SIZE,
  PENDING_RESET_REQUESTS_MAX_PAGE_SIZE,
  type ManagedUsersQueryState,
  type PendingResetRequestsQueryState,
} from "@/pages/settings/settings-managed-user-data-shared";
import {
  isSettingsAbortError,
  normalizeSettingsPageNumber,
  normalizeSettingsPageSize,
} from "@/pages/settings/settings-request-utils";
import {
  normalizeManagedUserRoleFilter,
  normalizeManagedUserStatusFilter,
} from "@/pages/settings/settings-managed-user-filter-utils";

export const isAbortError = isSettingsAbortError;

export function normalizeManagedUsersQuery(
  query: Partial<ManagedUsersQueryState> | undefined,
): ManagedUsersQueryState {
  const role = query?.role;
  const status = query?.status;
  return {
    page: normalizeSettingsPageNumber(query?.page),
    pageSize: normalizeSettingsPageSize(
      query?.pageSize,
      MANAGED_USERS_DEFAULT_PAGE_SIZE,
      MANAGED_USERS_MAX_PAGE_SIZE,
    ),
    search: String(query?.search || "").trim(),
    role: normalizeManagedUserRoleFilter(role),
    status: normalizeManagedUserStatusFilter(status),
  };
}

export function normalizePendingResetRequestsQuery(
  query: Partial<PendingResetRequestsQueryState> | undefined,
): PendingResetRequestsQueryState {
  const status = query?.status;
  return {
    page: normalizeSettingsPageNumber(query?.page),
    pageSize: normalizeSettingsPageSize(
      query?.pageSize,
      PENDING_RESET_REQUESTS_DEFAULT_PAGE_SIZE,
      PENDING_RESET_REQUESTS_MAX_PAGE_SIZE,
    ),
    search: String(query?.search || "").trim(),
    status: normalizeManagedUserStatusFilter(status),
  };
}
