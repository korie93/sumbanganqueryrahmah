import type {
  ManagedAccountsRoleFilter,
  ManagedAccountsStatusFilter,
} from "@/pages/settings/account-management/managed-accounts-shared";

export function normalizeManagedAccountsRoleFilter(value: string): ManagedAccountsRoleFilter {
  return value === "admin" || value === "user" ? value : "all";
}

export function normalizeManagedAccountsStatusFilter(value: string): ManagedAccountsStatusFilter {
  return value === "active"
    || value === "pending_activation"
    || value === "suspended"
    || value === "disabled"
    || value === "locked"
    || value === "banned"
    ? value
    : "all";
}

export function getManagedAccountsEmptyMessage(options: {
  loading: boolean;
  total: number;
  hasActiveFilters: boolean;
}) {
  if (options.loading) {
    return "Loading users...";
  }

  if (options.total === 0 && !options.hasActiveFilters) {
    return "No managed accounts found.";
  }

  return "No managed accounts match the current filters.";
}
