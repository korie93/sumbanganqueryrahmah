import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import {
  getManagedAccountsEmptyMessage,
  getManagedAccountsEmptyState,
  normalizeManagedAccountsRoleFilter,
  normalizeManagedAccountsStatusFilter,
} from "@/pages/settings/account-management/managed-accounts-utils";
import {
  MANAGED_ACCOUNT_ROLE_LABELS,
  MANAGED_ACCOUNT_STATUS_LABELS,
} from "@/pages/settings/account-management/managed-accounts-shared";
import {
  ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,
  normalizeSearchValue,
} from "@/pages/settings/account-management/utils";
import { getAccountManagementSearchSync } from "./account-management-search-sync";
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
  const previousAppliedSearch = useRef(query.search);
  const lastSubmittedSearch = useRef<string | null>(null);
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
  const { resetDraft, publishSearch } = getAccountManagementSearchSync({
    appliedSearch: query.search,
    previousAppliedSearch: previousAppliedSearch.current,
    lastSubmittedSearch: lastSubmittedSearch.current,
    draftSearch: searchQuery,
    deferredSearch: deferredSearchQuery,
  });

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
              label: `Role: ${MANAGED_ACCOUNT_ROLE_LABELS[roleFilter]}`,
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
              label: `Status: ${MANAGED_ACCOUNT_STATUS_LABELS[statusFilter]}`,
              tone: statusFilter === "banned" || statusFilter === "locked" ? "danger" : "warning",
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
    if (previousAppliedSearch.current !== query.search) lastSubmittedSearch.current = null;
    previousAppliedSearch.current = query.search;
    if (resetDraft) setSearchQuery(query.search);
  }, [query.search, resetDraft]);

  useEffect(() => {
    setRoleFilter(query.role);
  }, [query.role]);

  useEffect(() => {
    setStatusFilter(query.status);
  }, [query.status]);

  useEffect(() => {
    if (publishSearch === null) return;
    lastSubmittedSearch.current = publishSearch;
    onQueryChange({
      page: ACCOUNT_MANAGEMENT_FILTER_RESET_PAGE,
      search: publishSearch,
    });
  }, [onQueryChange, publishSearch]);

  const emptyMessage = useMemo(
    () =>
      getManagedAccountsEmptyMessage({
        loading,
        total,
        hasActiveFilters,
      }),
    [hasActiveFilters, loading, total],
  );
  const emptyState = useMemo(
    () =>
      getManagedAccountsEmptyState({
        loading,
        total,
        hasActiveFilters,
      }),
    [hasActiveFilters, loading, total],
  );

  return {
    activeFilters,
    emptyMessage,
    emptyState,
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
