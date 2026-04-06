import { useCallback, useEffect, useRef, useState } from "react";
import { getSuperuserManagedUsers } from "@/lib/api";
import {
  DEFAULT_MANAGED_USERS_PAGINATION,
  DEFAULT_MANAGED_USERS_QUERY,
  type ManagedUsersPaginationState,
  type ManagedUsersQueryState,
  type UseSettingsManagedUserDataArgs,
} from "@/pages/settings/settings-managed-user-data-shared";
import {
  isAbortError,
  normalizeManagedUsersQuery,
} from "@/pages/settings/settings-managed-user-data-utils";
import type { ManagedUser } from "@/pages/settings/types";
import { normalizeSettingsErrorPayload } from "@/pages/settings/utils";

export function useManagedUsersDataState({
  isMountedRef,
  toast,
}: UseSettingsManagedUserDataArgs) {
  const managedUsersRequestIdRef = useRef(0);
  const managedUsersAbortControllerRef = useRef<AbortController | null>(null);
  const managedUsersQueryRef = useRef<ManagedUsersQueryState>(DEFAULT_MANAGED_USERS_QUERY);

  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [managedUsersLoaded, setManagedUsersLoaded] = useState(false);
  const [managedUsersLoading, setManagedUsersLoading] = useState(false);
  const [managedUsersQuery, setManagedUsersQuery] = useState<ManagedUsersQueryState>(
    DEFAULT_MANAGED_USERS_QUERY,
  );
  const [managedUsersPagination, setManagedUsersPagination] = useState<ManagedUsersPaginationState>(
    DEFAULT_MANAGED_USERS_PAGINATION,
  );

  const abortManagedUsersRequest = useCallback(() => {
    if (managedUsersAbortControllerRef.current) {
      managedUsersAbortControllerRef.current.abort();
      managedUsersAbortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      managedUsersRequestIdRef.current += 1;
      abortManagedUsersRequest();
    };
  }, [abortManagedUsersRequest]);

  const loadManagedUsers = useCallback(async (queryInput?: Partial<ManagedUsersQueryState>) => {
    const query = normalizeManagedUsersQuery({
      ...managedUsersQueryRef.current,
      ...(queryInput || {}),
    });
    managedUsersQueryRef.current = query;
    if (isMountedRef.current) {
      setManagedUsersQuery(query);
    }

    const requestId = ++managedUsersRequestIdRef.current;
    setManagedUsersLoading(true);
    abortManagedUsersRequest();
    const controller = new AbortController();
    managedUsersAbortControllerRef.current = controller;
    try {
      const response = await getSuperuserManagedUsers(query, { signal: controller.signal });
      const nextUsers = Array.isArray(response?.users) ? response.users : [];
      const responsePagination = response?.pagination;
      const nextPagination: ManagedUsersPaginationState = {
        page: Math.max(1, Number(responsePagination?.page || query.page)),
        pageSize: Math.max(1, Number(responsePagination?.pageSize || query.pageSize)),
        total: Math.max(0, Number(responsePagination?.total || 0)),
        totalPages: Math.max(1, Number(responsePagination?.totalPages || 1)),
      };
      if (
        controller.signal.aborted
        || !isMountedRef.current
        || requestId !== managedUsersRequestIdRef.current
      ) {
        return nextUsers;
      }
      setManagedUsers(nextUsers);
      setManagedUsersLoaded(true);
      setManagedUsersPagination(nextPagination);
      setManagedUsersQuery((previous) => {
        const next = {
          ...previous,
          page: nextPagination.page,
          pageSize: nextPagination.pageSize,
          search: query.search,
          role: query.role,
          status: query.status,
        } satisfies ManagedUsersQueryState;
        managedUsersQueryRef.current = next;
        return next;
      });
      return nextUsers;
    } catch (error: unknown) {
      if (
        controller.signal.aborted
        || isAbortError(error)
        || !isMountedRef.current
        || requestId !== managedUsersRequestIdRef.current
      ) {
        return [];
      }
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: "Failed to Load Managed Users",
        description: parsed.message,
        variant: "destructive",
      });
      setManagedUsers([]);
      setManagedUsersLoaded(true);
      setManagedUsersPagination({
        page: query.page,
        pageSize: query.pageSize,
        total: 0,
        totalPages: 1,
      });
      return [];
    } finally {
      if (managedUsersAbortControllerRef.current === controller) {
        managedUsersAbortControllerRef.current = null;
      }
      if (
        controller.signal.aborted
        || !isMountedRef.current
        || requestId !== managedUsersRequestIdRef.current
      ) {
        return;
      }
      setManagedUsersLoading(false);
    }
  }, [abortManagedUsersRequest, isMountedRef, toast]);

  const refreshManagedUsersSection = useCallback(async (queryInput?: Partial<ManagedUsersQueryState>) => {
    await loadManagedUsers(queryInput);
  }, [loadManagedUsers]);

  const updateManagedUsersQuery = useCallback(async (queryInput: Partial<ManagedUsersQueryState>) => {
    await loadManagedUsers(queryInput);
  }, [loadManagedUsers]);

  return {
    loadManagedUsers,
    managedUsers,
    managedUsersLoaded,
    managedUsersLoading,
    managedUsersPagination,
    managedUsersQuery,
    refreshManagedUsersSection,
    updateManagedUsersQuery,
  };
}
