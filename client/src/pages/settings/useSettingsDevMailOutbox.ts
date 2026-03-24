import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  buildMutationErrorToast,
  buildMutationSuccessToast,
} from "@/lib/mutation-feedback";
import {
  clearDevMailOutboxPreviews,
  deleteDevMailOutboxPreview,
  getDevMailOutboxPreviews,
} from "@/lib/api";
import type { DevMailOutboxPreview } from "@/pages/settings/types";
import { normalizeSettingsErrorPayload } from "@/pages/settings/utils";

type ToastFn = (payload: {
  title: string;
  description: string;
  variant?: "default" | "destructive";
}) => void;

type UseSettingsDevMailOutboxArgs = {
  isMountedRef: MutableRefObject<boolean>;
  toast: ToastFn;
};

export type DevMailOutboxQueryState = {
  page: number;
  pageSize: number;
  searchEmail: string;
  searchSubject: string;
  sortDirection: "asc" | "desc";
};

export type DevMailOutboxPaginationState = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

const DEV_MAIL_OUTBOX_DEFAULT_PAGE_SIZE = 25;
const DEV_MAIL_OUTBOX_MAX_PAGE_SIZE = 100;

const DEV_MAIL_OUTBOX_DEFAULT_QUERY: DevMailOutboxQueryState = {
  page: 1,
  pageSize: DEV_MAIL_OUTBOX_DEFAULT_PAGE_SIZE,
  searchEmail: "",
  searchSubject: "",
  sortDirection: "desc",
};

const DEV_MAIL_OUTBOX_DEFAULT_PAGINATION: DevMailOutboxPaginationState = {
  page: 1,
  pageSize: DEV_MAIL_OUTBOX_DEFAULT_PAGE_SIZE,
  total: 0,
  totalPages: 1,
};

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function normalizeDevMailOutboxQuery(
  query: Partial<DevMailOutboxQueryState> | undefined,
): DevMailOutboxQueryState {
  const page = Number(query?.page);
  const pageSize = Number(query?.pageSize);
  return {
    page: Number.isFinite(page) ? Math.max(1, Math.floor(page)) : 1,
    pageSize: Number.isFinite(pageSize)
      ? Math.max(1, Math.min(DEV_MAIL_OUTBOX_MAX_PAGE_SIZE, Math.floor(pageSize)))
      : DEV_MAIL_OUTBOX_DEFAULT_PAGE_SIZE,
    searchEmail: String(query?.searchEmail || "").trim(),
    searchSubject: String(query?.searchSubject || "").trim(),
    sortDirection: query?.sortDirection === "asc" ? "asc" : "desc",
  };
}

export function useSettingsDevMailOutbox({
  isMountedRef,
  toast,
}: UseSettingsDevMailOutboxArgs) {
  const devMailOutboxRequestIdRef = useRef(0);
  const devMailOutboxAbortControllerRef = useRef<AbortController | null>(null);
  const deleteDevMailPreviewLocksRef = useRef<Set<string>>(new Set());
  const devMailOutboxQueryRef = useRef<DevMailOutboxQueryState>(DEV_MAIL_OUTBOX_DEFAULT_QUERY);

  const [devMailOutboxEntries, setDevMailOutboxEntries] = useState<DevMailOutboxPreview[]>([]);
  const [devMailOutboxEnabled, setDevMailOutboxEnabled] = useState(false);
  const [devMailOutboxLoading, setDevMailOutboxLoading] = useState(false);
  const [deletingDevMailOutboxId, setDeletingDevMailOutboxId] = useState<string | null>(null);
  const [clearingDevMailOutbox, setClearingDevMailOutbox] = useState(false);
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
      const responsePagination = response?.pagination;
      const nextPagination: DevMailOutboxPaginationState = {
        page: Math.max(1, Number(responsePagination?.page || query.page)),
        pageSize: Math.max(1, Number(responsePagination?.pageSize || query.pageSize)),
        total: Math.max(0, Number(responsePagination?.total || 0)),
        totalPages: Math.max(1, Number(responsePagination?.totalPages || 1)),
      };
      if (
        controller.signal.aborted ||
        !isMountedRef.current ||
        requestId !== devMailOutboxRequestIdRef.current
      ) {
        return {
          enabled: nextEnabled,
          previews: nextEntries,
          pagination: nextPagination,
        };
      }
      setDevMailOutboxEnabled(nextEnabled);
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
        controller.signal.aborted ||
        isAbortError(error) ||
        !isMountedRef.current ||
        requestId !== devMailOutboxRequestIdRef.current
      ) {
        return {
          enabled: false,
          previews: [] as DevMailOutboxPreview[],
          pagination: DEV_MAIL_OUTBOX_DEFAULT_PAGINATION,
        };
      }
      const parsed = normalizeSettingsErrorPayload(error);
      toast(buildMutationErrorToast({
        title: "Failed to Load Mail Outbox",
        error,
        fallbackDescription: parsed.message,
      }));
      setDevMailOutboxEntries([]);
      setDevMailOutboxPagination({
        page: query.page,
        pageSize: query.pageSize,
        total: 0,
        totalPages: 1,
      });
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
        controller.signal.aborted ||
        !isMountedRef.current ||
        requestId !== devMailOutboxRequestIdRef.current
      ) return;
      setDevMailOutboxLoading(false);
    }
  }, [abortDevMailOutboxRequest, isMountedRef, toast]);

  const refreshDevMailOutboxSection = useCallback(async (queryInput?: Partial<DevMailOutboxQueryState>) => {
    await loadDevMailOutbox(queryInput);
  }, [loadDevMailOutbox]);

  const updateDevMailOutboxQuery = useCallback(async (queryInput: Partial<DevMailOutboxQueryState>) => {
    await loadDevMailOutbox(queryInput);
  }, [loadDevMailOutbox]);

  const handleDeleteDevMailOutboxEntry = useCallback(async (previewId: string) => {
    const normalizedId = String(previewId || "").trim();
    if (!normalizedId || deleteDevMailPreviewLocksRef.current.has(normalizedId)) return;

    deleteDevMailPreviewLocksRef.current.add(normalizedId);
    setDeletingDevMailOutboxId(normalizedId);
    try {
      await deleteDevMailOutboxPreview(normalizedId);
      toast(buildMutationSuccessToast({
        title: "Email Preview Deleted",
        description: "The local mail preview has been removed.",
      }));
      await loadDevMailOutbox(devMailOutboxQueryRef.current);
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast(buildMutationErrorToast({
        title: parsed.code || "Delete Failed",
        error,
        fallbackDescription: parsed.message,
      }));
    } finally {
      deleteDevMailPreviewLocksRef.current.delete(normalizedId);
      if (isMountedRef.current) {
        setDeletingDevMailOutboxId((current) => (current === normalizedId ? null : current));
      }
    }
  }, [isMountedRef, loadDevMailOutbox, toast]);

  const handleClearDevMailOutbox = useCallback(async () => {
    if (clearingDevMailOutbox) return;

    setClearingDevMailOutbox(true);
    try {
      const response = await clearDevMailOutboxPreviews();
      toast(buildMutationSuccessToast({
        title: "Mail Outbox Cleared",
        description: `${response?.deletedCount ?? 0} email preview(s) removed.`,
      }));
      await loadDevMailOutbox(devMailOutboxQueryRef.current);
    } catch (error: unknown) {
      const parsed = normalizeSettingsErrorPayload(error);
      toast(buildMutationErrorToast({
        title: parsed.code || "Clear Failed",
        error,
        fallbackDescription: parsed.message,
      }));
    } finally {
      if (isMountedRef.current) {
        setClearingDevMailOutbox(false);
      }
    }
  }, [clearingDevMailOutbox, isMountedRef, loadDevMailOutbox, toast]);

  return {
    clearingDevMailOutbox,
    deletingDevMailOutboxId,
    devMailOutboxEnabled,
    devMailOutboxEntries,
    devMailOutboxLoading,
    devMailOutboxPagination,
    devMailOutboxQuery,
    handleClearDevMailOutbox,
    handleDeleteDevMailOutboxEntry,
    loadDevMailOutbox,
    refreshDevMailOutboxSection,
    updateDevMailOutboxQuery,
  };
}
