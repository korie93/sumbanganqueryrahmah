import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  getPendingPasswordResetRequests,
  getSuperuserManagedUsers,
} from "@/lib/api";
import type {
  ManagedUser,
  PendingPasswordResetRequest,
} from "@/pages/settings/types";
import { normalizeSettingsErrorPayload } from "@/pages/settings/utils";

type ToastFn = (payload: {
  title: string;
  description: string;
  variant?: "default" | "destructive";
}) => void;

type UseSettingsManagedUserDataArgs = {
  isMountedRef: MutableRefObject<boolean>;
  toast: ToastFn;
};

export type ManagedUsersQueryState = {
  page: number;
  pageSize: number;
  search: string;
  role: "all" | "admin" | "user";
  status: "all" | "active" | "pending_activation" | "suspended" | "disabled" | "locked" | "banned";
};

export type ManagedUsersPaginationState = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type PendingResetRequestsQueryState = {
  page: number;
  pageSize: number;
  search: string;
  status: "all" | "active" | "pending_activation" | "suspended" | "disabled" | "locked" | "banned";
};

export type PendingResetRequestsPaginationState = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const MANAGED_USERS_DEFAULT_PAGE_SIZE = 50;
const MANAGED_USERS_MAX_PAGE_SIZE = 100;
const PENDING_RESET_REQUESTS_DEFAULT_PAGE_SIZE = 50;
const PENDING_RESET_REQUESTS_MAX_PAGE_SIZE = 100;

const DEFAULT_MANAGED_USERS_QUERY: ManagedUsersQueryState = {
  page: 1,
  pageSize: MANAGED_USERS_DEFAULT_PAGE_SIZE,
  search: "",
  role: "all",
  status: "all",
};

const DEFAULT_MANAGED_USERS_PAGINATION: ManagedUsersPaginationState = {
  page: 1,
  pageSize: MANAGED_USERS_DEFAULT_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

const DEFAULT_PENDING_RESET_REQUESTS_QUERY: PendingResetRequestsQueryState = {
  page: 1,
  pageSize: PENDING_RESET_REQUESTS_DEFAULT_PAGE_SIZE,
  search: "",
  status: "all",
};

const DEFAULT_PENDING_RESET_REQUESTS_PAGINATION: PendingResetRequestsPaginationState = {
  page: 1,
  pageSize: PENDING_RESET_REQUESTS_DEFAULT_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function normalizeManagedUsersQuery(
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
    role: role === "admin" || role === "user" ? role : "all",
    status:
      status === "active"
      || status === "pending_activation"
      || status === "suspended"
      || status === "disabled"
      || status === "locked"
      || status === "banned"
        ? status
        : "all",
  };
}

function normalizePendingResetRequestsQuery(
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
    status:
      status === "active"
      || status === "pending_activation"
      || status === "suspended"
      || status === "disabled"
      || status === "locked"
      || status === "banned"
        ? status
        : "all",
  };
}

export function useSettingsManagedUserData({
  isMountedRef,
  toast,
}: UseSettingsManagedUserDataArgs) {
  const managedUsersRequestIdRef = useRef(0);
  const pendingResetRequestsRequestIdRef = useRef(0);
  const managedUsersAbortControllerRef = useRef<AbortController | null>(null);
  const pendingResetRequestsAbortControllerRef = useRef<AbortController | null>(null);
  const managedUsersQueryRef = useRef<ManagedUsersQueryState>(DEFAULT_MANAGED_USERS_QUERY);
  const pendingResetRequestsQueryRef = useRef<PendingResetRequestsQueryState>(
    DEFAULT_PENDING_RESET_REQUESTS_QUERY,
  );

  const [managedUsers, setManagedUsers] = useState<ManagedUser[]>([]);
  const [managedUsersLoading, setManagedUsersLoading] = useState(false);
  const [managedUsersQuery, setManagedUsersQuery] = useState<ManagedUsersQueryState>(
    DEFAULT_MANAGED_USERS_QUERY,
  );
  const [managedUsersPagination, setManagedUsersPagination] = useState<ManagedUsersPaginationState>(
    DEFAULT_MANAGED_USERS_PAGINATION,
  );
  const [pendingResetRequests, setPendingResetRequests] = useState<PendingPasswordResetRequest[]>([]);
  const [pendingResetRequestsLoading, setPendingResetRequestsLoading] = useState(false);
  const [pendingResetRequestsQuery, setPendingResetRequestsQuery] = useState<PendingResetRequestsQueryState>(
    DEFAULT_PENDING_RESET_REQUESTS_QUERY,
  );
  const [pendingResetRequestsPagination, setPendingResetRequestsPagination] =
    useState<PendingResetRequestsPaginationState>(DEFAULT_PENDING_RESET_REQUESTS_PAGINATION);

  const abortManagedUsersRequest = useCallback(() => {
    if (managedUsersAbortControllerRef.current) {
      managedUsersAbortControllerRef.current.abort();
      managedUsersAbortControllerRef.current = null;
    }
  }, []);

  const abortPendingResetRequestsRequest = useCallback(() => {
    if (pendingResetRequestsAbortControllerRef.current) {
      pendingResetRequestsAbortControllerRef.current.abort();
      pendingResetRequestsAbortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      managedUsersRequestIdRef.current += 1;
      pendingResetRequestsRequestIdRef.current += 1;
      abortManagedUsersRequest();
      abortPendingResetRequestsRequest();
    };
  }, [abortManagedUsersRequest, abortPendingResetRequestsRequest]);

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
        controller.signal.aborted ||
        !isMountedRef.current ||
        requestId !== managedUsersRequestIdRef.current
      ) return nextUsers;
      setManagedUsers(nextUsers);
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
        controller.signal.aborted ||
        isAbortError(error) ||
        !isMountedRef.current ||
        requestId !== managedUsersRequestIdRef.current
      ) return [];
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: "Failed to Load Managed Users",
        description: parsed.message,
        variant: "destructive",
      });
      setManagedUsers([]);
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
        controller.signal.aborted ||
        !isMountedRef.current ||
        requestId !== managedUsersRequestIdRef.current
      ) return;
      setManagedUsersLoading(false);
    }
  }, [abortManagedUsersRequest, isMountedRef, toast]);

  const loadPendingResetRequests = useCallback(async (queryInput?: Partial<PendingResetRequestsQueryState>) => {
    const query = normalizePendingResetRequestsQuery({
      ...pendingResetRequestsQueryRef.current,
      ...(queryInput || {}),
    });
    pendingResetRequestsQueryRef.current = query;
    if (isMountedRef.current) {
      setPendingResetRequestsQuery(query);
    }

    const requestId = ++pendingResetRequestsRequestIdRef.current;
    setPendingResetRequestsLoading(true);
    abortPendingResetRequestsRequest();
    const controller = new AbortController();
    pendingResetRequestsAbortControllerRef.current = controller;
    try {
      const response = await getPendingPasswordResetRequests(query, { signal: controller.signal });
      const nextRequests = Array.isArray(response?.requests) ? response.requests : [];
      const responsePagination = response?.pagination;
      const nextPagination: PendingResetRequestsPaginationState = {
        page: Math.max(1, Number(responsePagination?.page || query.page)),
        pageSize: Math.max(1, Number(responsePagination?.pageSize || query.pageSize)),
        total: Math.max(0, Number(responsePagination?.total || 0)),
        totalPages: Math.max(1, Number(responsePagination?.totalPages || 1)),
      };
      if (
        controller.signal.aborted ||
        !isMountedRef.current ||
        requestId !== pendingResetRequestsRequestIdRef.current
      ) {
        return nextRequests;
      }
      setPendingResetRequests(nextRequests);
      setPendingResetRequestsPagination(nextPagination);
      setPendingResetRequestsQuery((previous) => {
        const next = {
          ...previous,
          page: nextPagination.page,
          pageSize: nextPagination.pageSize,
          search: query.search,
          status: query.status,
        } satisfies PendingResetRequestsQueryState;
        pendingResetRequestsQueryRef.current = next;
        return next;
      });
      return nextRequests;
    } catch (error: unknown) {
      if (
        controller.signal.aborted ||
        isAbortError(error) ||
        !isMountedRef.current ||
        requestId !== pendingResetRequestsRequestIdRef.current
      ) {
        return [];
      }
      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: "Failed to Load Reset Requests",
        description: parsed.message,
        variant: "destructive",
      });
      setPendingResetRequests([]);
      setPendingResetRequestsPagination({
        page: query.page,
        pageSize: query.pageSize,
        total: 0,
        totalPages: 1,
      });
      return [];
    } finally {
      if (pendingResetRequestsAbortControllerRef.current === controller) {
        pendingResetRequestsAbortControllerRef.current = null;
      }
      if (
        controller.signal.aborted ||
        !isMountedRef.current ||
        requestId !== pendingResetRequestsRequestIdRef.current
      ) return;
      setPendingResetRequestsLoading(false);
    }
  }, [abortPendingResetRequestsRequest, isMountedRef, toast]);

  const refreshManagedUsersSection = useCallback(async (queryInput?: Partial<ManagedUsersQueryState>) => {
    await loadManagedUsers(queryInput);
  }, [loadManagedUsers]);

  const refreshPendingResetRequestsSection = useCallback(async (queryInput?: Partial<PendingResetRequestsQueryState>) => {
    await loadPendingResetRequests(queryInput);
  }, [loadPendingResetRequests]);

  const updateManagedUsersQuery = useCallback(async (queryInput: Partial<ManagedUsersQueryState>) => {
    await loadManagedUsers(queryInput);
  }, [loadManagedUsers]);

  const updatePendingResetRequestsQuery = useCallback(
    async (queryInput: Partial<PendingResetRequestsQueryState>) => {
      await loadPendingResetRequests(queryInput);
    },
    [loadPendingResetRequests],
  );

  return {
    loadManagedUsers,
    loadPendingResetRequests,
    managedUsers,
    managedUsersLoading,
    managedUsersPagination,
    managedUsersQuery,
    pendingResetRequests,
    pendingResetRequestsLoading,
    pendingResetRequestsPagination,
    pendingResetRequestsQuery,
    refreshManagedUsersSection,
    refreshPendingResetRequestsSection,
    updateManagedUsersQuery,
    updatePendingResetRequestsQuery,
  };
}
