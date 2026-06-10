import { normalizeManagedUserStatusFilter } from "@/pages/settings/settings-managed-user-filter-utils";
import type { PendingResetEmptyStateContent } from "@/pages/settings/account-management/pending-reset-shared";

export function normalizePendingResetStatusFilter(
  value: string,
): "all" | "active" | "pending_activation" | "suspended" | "disabled" | "locked" | "banned" {
  return normalizeManagedUserStatusFilter(value);
}

export function getPendingResetEmptyMessage(options: {
  hasActiveFilters: boolean;
  loading: boolean;
  total: number;
}) {
  return getPendingResetEmptyState(options).title;
}

export function getPendingResetEmptyState(options: {
  hasActiveFilters: boolean;
  loading: boolean;
  total: number;
}): PendingResetEmptyStateContent {
  if (options.loading) {
    return {
      title: "Loading reset requests...",
      description: "Refreshing user-submitted password reset requests.",
    };
  }

  if (options.total === 0 && !options.hasActiveFilters) {
    return {
      title: "No pending reset requests.",
      description: "New user requests will appear here when they ask for password reset help.",
    };
  }

  return {
    title: "No reset requests match the current filters.",
    description: "Clear the active filters or adjust the search term to review more reset requests.",
    actionLabel: "Clear filters",
  };
}
