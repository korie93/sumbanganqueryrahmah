import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type { ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import {
  getManagedAccountsEmptyMessage,
  normalizeManagedAccountsRoleFilter,
  normalizeManagedAccountsStatusFilter,
} from "@/pages/settings/account-management/managed-accounts-utils";
import {
  ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,
  hasNormalizedSearchChanged,
  normalizeSearchValue,
  shouldSyncNormalizedSearch,
} from "@/pages/settings/account-management/utils";
import type { ManagedUser } from "@/pages/settings/types";
import type { ManagedUsersQueryState } from "@/pages/settings/useSettingsManagedUserData";

type UseManagedAccountsFilterStateArgs = {
  loading: boolean;
  onQueryChange: (query: Partial<ManagedUsersQueryState>) => void;
  query: ManagedUsersQueryState;
  total: number;
};

export function useManagedAccountsFilterState({
  loading,
  onQueryChange,
  query,
  total,
}: UseManagedAccountsFilterStateArgs) {
  const [searchQuery, setSearchQuery] = useState(query.search);
  const [roleFilter, setRoleFilter] = useState(query.role);
  const [statusFilter, setStatusFilter] = useState(query.status);
  const [userToBanToggle, setUserToBanToggle] = useState<ManagedUser | null>(null);
  const [userToDelete, setUserToDelete] = useState<ManagedUser | null>(null);
  const [userToResetPassword, setUserToResetPassword] = useState<ManagedUser | null>(null);

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const normalizedDeferredSearch = useMemo(
    () => normalizeSearchValue(deferredSearchQuery),
    [deferredSearchQuery],
  );

  const hasActiveFilters = normalizedDeferredSearch.length > 0
    || roleFilter !== "all"
    || statusFilter !== "all";

  const activeFilters = useMemo<ActiveFilterChip[]>(
    () => {
      const chips: Array<ActiveFilterChip | null> = [
        normalizedDeferredSearch
          ? {
              id: "managed-search",
              label: `Search: ${deferredSearchQuery.trim()}`,
              onRemove: () => setSearchQuery(""),
            }
          : null,
        roleFilter !== "all"
          ? {
              id: "managed-role",
              label: `Role: ${roleFilter}`,
              onRemove: () => {
                setRoleFilter("all");
                onQueryChange({
                  page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,
                  role: "all",
                });
              },
            }
          : null,
        statusFilter !== "all"
          ? {
              id: "managed-status",
              label: `Status: ${statusFilter}`,
              onRemove: () => {
                setStatusFilter("all");
                onQueryChange({
                  page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,
                  status: "all",
                });
              },
            }
          : null,
      ];

      return chips.filter((item): item is ActiveFilterChip => item !== null);
    },
    [deferredSearchQuery, normalizedDeferredSearch, onQueryChange, roleFilter, statusFilter],
  );

  useEffect(() => {
    if (hasNormalizedSearchChanged(searchQuery, query.search)) {
      setSearchQuery(query.search);
    }
  }, [query.search, searchQuery]);

  useEffect(() => {
    if (roleFilter !== query.role) {
      setRoleFilter(query.role);
    }
  }, [query.role, roleFilter]);

  useEffect(() => {
    if (statusFilter !== query.status) {
      setStatusFilter(query.status);
    }
  }, [query.status, statusFilter]);

  useEffect(() => {
    if (!shouldSyncNormalizedSearch(normalizedDeferredSearch, query.search)) {
      return;
    }
    onQueryChange({
      page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,
      search: normalizedDeferredSearch,
    });
  }, [normalizedDeferredSearch, onQueryChange, query.search]);

  const emptyMessage = useMemo(
    () =>
      getManagedAccountsEmptyMessage({
        loading,
        total,
        hasActiveFilters,
      }),
    [hasActiveFilters, loading, total],
  );

  return {
    activeFilters,
    emptyMessage,
    hasActiveFilters,
    roleFilter,
    searchQuery,
    statusFilter,
    userToBanToggle,
    userToDelete,
    userToResetPassword,
    clearAllFilters: () => {
      setSearchQuery("");
      setRoleFilter("all");
      setStatusFilter("all");
      onQueryChange({
        page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,
        search: "",
        role: "all",
        status: "all",
      });
    },
    closeDeleteDialog: () => {
      setUserToDelete(null);
    },
    closeBanToggleDialog: () => {
      setUserToBanToggle(null);
    },
    closeResetPasswordDialog: () => {
      setUserToResetPassword(null);
    },
    onRoleChange: (value: string) => {
      const nextRole = normalizeManagedAccountsRoleFilter(value);
      setRoleFilter(nextRole);
      onQueryChange({
        page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,
        role: nextRole,
      });
    },
    onSearchQueryChange: (value: string) => {
      setSearchQuery(value);
    },
    onStatusChange: (value: string) => {
      const nextStatus = normalizeManagedAccountsStatusFilter(value);
      setStatusFilter(nextStatus);
      onQueryChange({
        page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,
        status: nextStatus,
      });
    },
    openDeleteDialog: (user: ManagedUser) => {
      setUserToDelete(user);
    },
    openBanToggleDialog: (user: ManagedUser) => {
      setUserToBanToggle(user);
    },
    openResetPasswordDialog: (user: ManagedUser) => {
      setUserToResetPassword(user);
    },
  };
}
