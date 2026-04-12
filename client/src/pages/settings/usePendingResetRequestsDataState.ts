import { useCallback, useEffect, useRef, useState } from "react";
import { getPendingPasswordResetRequests } from "@/lib/api";
import {
  DEFAULT_PENDING_RESET_REQUESTS_PAGINATION,
  DEFAULT_PENDING_RESET_REQUESTS_QUERY,
  type PendingResetRequestsPaginationState,
  type PendingResetRequestsQueryState,
  type UseSettingsManagedUserDataArgs,
} from "@/pages/settings/settings-managed-user-data-shared";
import {
  isAbortError,
  normalizePendingResetRequestsQuery,
} from "@/pages/settings/settings-managed-user-data-utils";
import { normalizeSettingsPaginationState } from "@/pages/settings/settings-request-utils";
import type { PendingPasswordResetRequest } from "@/pages/settings/types";
import { normalizeSettingsErrorPayload } from "@/pages/settings/utils";

export function usePendingResetRequestsDataState({
  isMountedRef,
  toast,
}: UseSettingsManagedUserDataArgs) {
  const pendingResetRequestsRequestIdRef = useRef(0);
  const pendingResetRequestsAbortControllerRef = useRef<AbortController | null>(null);
  const pendingResetRequestsQueryRef = useRef<PendingResetRequestsQueryState>(
    DEFAULT_PENDING_RESET_REQUESTS_QUERY,
  );

  const [pendingResetRequests, setPendingResetRequests] = useState<PendingPasswordResetRequest[]>(
    [],
  );
  const [pendingResetRequestsLoaded, setPendingResetRequestsLoaded] = useState(false);
  const [pendingResetRequestsLoading, setPendingResetRequestsLoading] = useState(false);
  const [pendingResetRequestsQuery, setPendingResetRequestsQuery] =
    useState<PendingResetRequestsQueryState>(DEFAULT_PENDING_RESET_REQUESTS_QUERY);
  const [pendingResetRequestsPagination, setPendingResetRequestsPagination] =
    useState<PendingResetRequestsPaginationState>(DEFAULT_PENDING_RESET_REQUESTS_PAGINATION);

  const abortPendingResetRequestsRequest = useCallback(() => {
    if (pendingResetRequestsAbortControllerRef.current) {
      pendingResetRequestsAbortControllerRef.current.abort();
      pendingResetRequestsAbortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      pendingResetRequestsRequestIdRef.current += 1;
      abortPendingResetRequestsRequest();
    };
  }, [abortPendingResetRequestsRequest]);

  const loadPendingResetRequests = useCallback(
    async (queryInput?: Partial<PendingResetRequestsQueryState>) => {
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
        const nextPagination: PendingResetRequestsPaginationState = normalizeSettingsPaginationState(
          response?.pagination,
          query,
        );
        if (
          controller.signal.aborted
          || !isMountedRef.current
          || requestId !== pendingResetRequestsRequestIdRef.current
        ) {
          return nextRequests;
        }
        setPendingResetRequests(nextRequests);
        setPendingResetRequestsLoaded(true);
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
          controller.signal.aborted
          || isAbortError(error)
          || !isMountedRef.current
          || requestId !== pendingResetRequestsRequestIdRef.current
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
        setPendingResetRequestsLoaded(true);
        setPendingResetRequestsPagination(normalizeSettingsPaginationState(undefined, query));
        return [];
      } finally {
        if (pendingResetRequestsAbortControllerRef.current === controller) {
          pendingResetRequestsAbortControllerRef.current = null;
        }
        if (
          controller.signal.aborted
          || !isMountedRef.current
          || requestId !== pendingResetRequestsRequestIdRef.current
        ) {
          return;
        }
        setPendingResetRequestsLoading(false);
      }
    },
    [abortPendingResetRequestsRequest, isMountedRef, toast],
  );

  const refreshPendingResetRequestsSection = useCallback(
    async (queryInput?: Partial<PendingResetRequestsQueryState>) => {
      await loadPendingResetRequests(queryInput);
    },
    [loadPendingResetRequests],
  );

  const updatePendingResetRequestsQuery = useCallback(
    async (queryInput: Partial<PendingResetRequestsQueryState>) => {
      await loadPendingResetRequests(queryInput);
    },
    [loadPendingResetRequests],
  );

  return {
    loadPendingResetRequests,
    pendingResetRequests,
    pendingResetRequestsLoaded,
    pendingResetRequestsLoading,
    pendingResetRequestsPagination,
    pendingResetRequestsQuery,
    refreshPendingResetRequestsSection,
    updatePendingResetRequestsQuery,
  };
}
