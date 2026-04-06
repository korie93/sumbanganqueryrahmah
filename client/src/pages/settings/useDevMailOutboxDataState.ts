import { useCallback, useEffect, useRef, useState } from "react";
import { getDevMailOutboxPreviews } from "@/lib/api";
import {
  DEV_MAIL_OUTBOX_DEFAULT_PAGINATION,
  DEV_MAIL_OUTBOX_DEFAULT_QUERY,
  type DevMailOutboxPaginationState,
  type DevMailOutboxQueryState,
  type UseSettingsDevMailOutboxArgs,
} from "@/pages/settings/settings-dev-mail-outbox-shared";
import {
  isAbortError,
  normalizeDevMailOutboxPagination,
  normalizeDevMailOutboxQuery,
} from "@/pages/settings/settings-dev-mail-outbox-utils";
import type { DevMailOutboxPreview } from "@/pages/settings/types";
import { normalizeSettingsErrorPayload } from "@/pages/settings/utils";

export function useDevMailOutboxDataState({
  isMountedRef,
  toast,
}: UseSettingsDevMailOutboxArgs) {
  const devMailOutboxRequestIdRef = useRef(0);
  const devMailOutboxAbortControllerRef = useRef<AbortController | null>(null);
  const devMailOutboxQueryRef = useRef<DevMailOutboxQueryState>(DEV_MAIL_OUTBOX_DEFAULT_QUERY);

  const [devMailOutboxEntries, setDevMailOutboxEntries] = useState<DevMailOutboxPreview[]>([]);
  const [devMailOutboxEnabled, setDevMailOutboxEnabled] = useState(false);
  const [devMailOutboxLoaded, setDevMailOutboxLoaded] = useState(false);
  const [devMailOutboxLoading, setDevMailOutboxLoading] = useState(false);
  const [devMailOutboxQuery, setDevMailOutboxQuery] = useState<DevMailOutboxQueryState>(
    DEV_MAIL_OUTBOX_DEFAULT_QUERY,
  );
  const [devMailOutboxPagination, setDevMailOutboxPagination] = useState<DevMailOutboxPaginationState>(
    DEV_MAIL_OUTBOX_DEFAULT_PAGINATION,
  );

  const abortDevMailOutboxRequest = useCallback(() => {
    if (devMailOutboxAbortControllerRef.current) {
      devMailOutboxAbortControllerRef.current.abort();
      devMailOutboxAbortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      devMailOutboxRequestIdRef.current += 1;
      abortDevMailOutboxRequest();
    };
  }, [abortDevMailOutboxRequest]);

  const loadDevMailOutbox = useCallback(async (queryInput?: Partial<DevMailOutboxQueryState>) => {
    const query = normalizeDevMailOutboxQuery({
      ...devMailOutboxQueryRef.current,
      ...(queryInput || {}),
    });
    devMailOutboxQueryRef.current = query;

    if (isMountedRef.current) {
      setDevMailOutboxQuery(query);
    }

    const requestId = ++devMailOutboxRequestIdRef.current;
    setDevMailOutboxLoading(true);
    abortDevMailOutboxRequest();
    const controller = new AbortController();
    devMailOutboxAbortControllerRef.current = controller;

    try {
      const response = await getDevMailOutboxPreviews(query, { signal: controller.signal });
      const nextEntries = Array.isArray(response?.previews) ? response.previews : [];
      const nextEnabled = Boolean(response?.enabled);
      const nextPagination = normalizeDevMailOutboxPagination(response?.pagination, query);

      if (
        controller.signal.aborted
        || !isMountedRef.current
        || requestId !== devMailOutboxRequestIdRef.current
      ) {
        return {
          enabled: nextEnabled,
          previews: nextEntries,
          pagination: nextPagination,
        };
      }

      setDevMailOutboxEnabled(nextEnabled);
      setDevMailOutboxLoaded(true);
      setDevMailOutboxEntries(nextEntries);
      setDevMailOutboxPagination(nextPagination);
      setDevMailOutboxQuery((previous) => {
        const next = {
          ...previous,
          page: nextPagination.page,
          pageSize: nextPagination.pageSize,
          searchEmail: query.searchEmail,
          searchSubject: query.searchSubject,
          sortDirection: query.sortDirection,
        } satisfies DevMailOutboxQueryState;
        devMailOutboxQueryRef.current = next;
        return next;
      });

      return {
        enabled: nextEnabled,
        previews: nextEntries,
        pagination: nextPagination,
      };
    } catch (error: unknown) {
      if (
        controller.signal.aborted
        || isAbortError(error)
        || !isMountedRef.current
        || requestId !== devMailOutboxRequestIdRef.current
      ) {
        return {
          enabled: false,
          previews: [] as DevMailOutboxPreview[],
          pagination: DEV_MAIL_OUTBOX_DEFAULT_PAGINATION,
        };
      }

      const parsed = normalizeSettingsErrorPayload(error);
      toast({
        title: "Failed to Load Mail Outbox",
        description: parsed.message,
        variant: "destructive",
      });
      setDevMailOutboxEntries([]);
      setDevMailOutboxLoaded(true);
      setDevMailOutboxPagination(normalizeDevMailOutboxPagination(undefined, query));

      return {
        enabled: false,
        previews: [] as DevMailOutboxPreview[],
        pagination: DEV_MAIL_OUTBOX_DEFAULT_PAGINATION,
      };
    } finally {
      if (devMailOutboxAbortControllerRef.current === controller) {
        devMailOutboxAbortControllerRef.current = null;
      }
      if (
        controller.signal.aborted
        || !isMountedRef.current
        || requestId !== devMailOutboxRequestIdRef.current
      ) {
        return;
      }
      setDevMailOutboxLoading(false);
    }
  }, [abortDevMailOutboxRequest, isMountedRef, toast]);

  const refreshDevMailOutboxSection = useCallback(async (queryInput?: Partial<DevMailOutboxQueryState>) => {
    await loadDevMailOutbox(queryInput);
  }, [loadDevMailOutbox]);

  const updateDevMailOutboxQuery = useCallback(async (queryInput: Partial<DevMailOutboxQueryState>) => {
    await loadDevMailOutbox(queryInput);
  }, [loadDevMailOutbox]);

  const getCurrentDevMailOutboxQuery = useCallback(() => devMailOutboxQueryRef.current, []);

  return {
    devMailOutboxEnabled,
    devMailOutboxEntries,
    devMailOutboxLoaded,
    devMailOutboxLoading,
    devMailOutboxPagination,
    devMailOutboxQuery,
    getCurrentDevMailOutboxQuery,
    loadDevMailOutbox,
    refreshDevMailOutboxSection,
    updateDevMailOutboxQuery,
  };
}
