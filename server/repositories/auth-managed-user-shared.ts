import type {
  ManagedUserListPageParams,
  ManagedUserListStatusFilter,
  PendingPasswordResetListPageParams,
} from "./auth-repository-types";

export type ManagedUserRoleFilter = "all" | "admin" | "user";

export function normalizeManagedUserRoleFilter(value: unknown): ManagedUserRoleFilter {
  const normalized = String(value || "all").trim().toLowerCase();
  return normalized === "admin" || normalized === "user" ? normalized : "all";
}

export function normalizeManagedUserStatusFilter(value: unknown): ManagedUserListStatusFilter {
  const normalized = String(value || "all").trim().toLowerCase();
  switch (normalized) {
    case "active":
    case "pending_activation":
    case "suspended":
    case "disabled":
    case "locked":
    case "banned":
      return normalized;
    default:
      return "all";
  }
}

export function normalizeManagedUserListFilters(params: ManagedUserListPageParams = {}) {
  return {
    search: String(params.search || "").trim(),
    role: normalizeManagedUserRoleFilter(params.role),
    status: normalizeManagedUserStatusFilter(params.status),
  };
}

export function normalizePendingPasswordResetListFilters(
  params: PendingPasswordResetListPageParams = {},
) {
  return {
    search: String(params.search || "").trim(),
    status: normalizeManagedUserStatusFilter(params.status),
  };
}
