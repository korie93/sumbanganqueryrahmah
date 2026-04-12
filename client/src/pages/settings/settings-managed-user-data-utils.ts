import {
  MANAGED_USERS_DEFAULT_PAGE_SIZE,
  MANAGED_USERS_MAX_PAGE_SIZE,
  PENDING_RESET_REQUESTS_DEFAULT_PAGE_SIZE,
  PENDING_RESET_REQUESTS_MAX_PAGE_SIZE,
  type ManagedUsersQueryState,
  type PendingResetRequestsQueryState,
} from "@/pages/settings/settings-managed-user-data-shared";
import {
  normalizeManagedUserRoleFilter,
  normalizeManagedUserStatusFilter,
} from "@/pages/settings/settings-managed-user-filter-utils";

export function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function normalizeManagedUsersQuery(
  query: Partial<ManagedUsersQueryState> | undefined,
): ManagedUsersQueryState {
  const page = Number(query?.page);
  const pageSize = Number(query?.pageSize);
  const role = query?.role;
  const status = query?.status;
  return {
    page: Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1,
    pageSize: Number.isFinite(pageSize)
      ? Math.max(1, Math.min(MANAGED_USERS_MAX_PAGE_SIZE, Math.floor(pageSize)))
      : MANAGED_USERS_DEFAULT_PAGE_SIZE,
    search: String(query?.search || "").trim(),
    role: normalizeManagedUserRoleFilter(role),
    status: normalizeManagedUserStatusFilter(status),
  };
}

export function normalizePendingResetRequestsQuery(
  query: Partial<PendingResetRequestsQueryState> | undefined,
): PendingResetRequestsQueryState {
  const page = Number(query?.page);
  const pageSize = Number(query?.pageSize);
  const status = query?.status;
  return {
    page: Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1,
    pageSize: Number.isFinite(pageSize)
      ? Math.max(1, Math.min(PENDING_RESET_REQUESTS_MAX_PAGE_SIZE, Math.floor(pageSize)))
      : PENDING_RESET_REQUESTS_DEFAULT_PAGE_SIZE,
    search: String(query?.search || "").trim(),
    status: normalizeManagedUserStatusFilter(status),
  };
}
