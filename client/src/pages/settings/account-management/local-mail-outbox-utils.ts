import type { LocalMailOutboxEmptyStateContent } from "@/pages/settings/account-management/local-mail-outbox-shared";

export function normalizeLocalMailOutboxSortDirection(value: string): "asc" | "desc" {
  return value === "asc" ? "asc" : "desc";
}

export function getLocalMailOutboxEmptyMessage(options: {
  hasSearchFilter: boolean;
  loading: boolean;
  total: number;
}) {
  return getLocalMailOutboxEmptyState(options).title;
}

export function getLocalMailOutboxEmptyState(options: {
  hasSearchFilter: boolean;
  loading: boolean;
  total: number;
}): LocalMailOutboxEmptyStateContent {
  if (options.loading) {
    return {
      title: "Loading local mail previews...",
      description: "Refreshing local activation and password reset email previews.",
    };
  }

  if (options.total === 0 && !options.hasSearchFilter) {
    return {
      title: "No local email previews captured yet.",
      description: "Development activation and reset emails will appear here when generated.",
    };
  }

  return {
    title: "No email previews match the current filters.",
    description: "Clear the email or subject search terms to review more local mail previews.",
    actionLabel: "Clear filters",
  };
}
