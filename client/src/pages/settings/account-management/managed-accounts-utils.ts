import type {
  ManagedAccountsRoleFilter,
  ManagedAccountsStatusFilter,
} from "@/pages/settings/account-management/managed-accounts-shared";
import {
  normalizeManagedUserRoleFilter,
  normalizeManagedUserStatusFilter,
} from "@/pages/settings/settings-managed-user-filter-utils";

export function normalizeManagedAccountsRoleFilter(value: string): ManagedAccountsRoleFilter {
  return normalizeManagedUserRoleFilter(value);
}

export function normalizeManagedAccountsStatusFilter(value: string): ManagedAccountsStatusFilter {
  return normalizeManagedUserStatusFilter(value);
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
