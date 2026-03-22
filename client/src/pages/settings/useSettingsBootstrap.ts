import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { getMe } from "@/lib/api";
import type { CurrentUser } from "@/pages/settings/types";
import { normalizeSettingsErrorPayload } from "@/pages/settings/utils";

type ToastFn = (payload: {
  title: string;
  description: string;
  variant?: "default" | "destructive";
}) => void;

type UseSettingsBootstrapArgs = {
  clearSettingsState: () => void;
  hydrateCurrentUser: (nextUser: CurrentUser) => void;
  isMountedRef: MutableRefObject<boolean>;
  loadDevMailOutbox: () => Promise<unknown>;
  loadManagedUsers: () => Promise<unknown>;
  loadPendingResetRequests: () => Promise<unknown>;
  loadSettings: () => Promise<void>;
  toast: ToastFn;
};

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

export function useSettingsBootstrap({
  clearSettingsState,
  hydrateCurrentUser,
  isMountedRef,
  loadDevMailOutbox,
  loadManagedUsers,
  loadPendingResetRequests,
  loadSettings,
  toast,
}: UseSettingsBootstrapArgs) {
  const bootstrapRequestIdRef = useRef(0);
  const bootstrapAbortControllerRef = useRef<AbortController | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

  const abortBootstrapRequest = useCallback(() => {
    if (bootstrapAbortControllerRef.current) {
      bootstrapAbortControllerRef.current.abort();
      bootstrapAbortControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      bootstrapRequestIdRef.current += 1;
      abortBootstrapRequest();
    };
  }, [abortBootstrapRequest]);

  useEffect(() => {
    const requestId = ++bootstrapRequestIdRef.current;
    abortBootstrapRequest();
    const controller = new AbortController();
    bootstrapAbortControllerRef.current = controller;

    const bootstrap = async () => {
      setProfileLoading(true);
      try {
        const me = await getMe({ signal: controller.signal });
        if (
          controller.signal.aborted ||
          !isMountedRef.current ||
          requestId !== bootstrapRequestIdRef.current
        ) return;

        hydrateCurrentUser(me);

        if (me.role === "admin" || me.role === "superuser") {
          await loadSettings();
        } else {
          clearSettingsState();
        }

        if (
          me.role === "superuser" &&
          isMountedRef.current &&
          requestId === bootstrapRequestIdRef.current
        ) {
          await loadManagedUsers();
          if (
            isMountedRef.current &&
            requestId === bootstrapRequestIdRef.current
          ) {
            await loadPendingResetRequests();
            if (
              isMountedRef.current &&
              requestId === bootstrapRequestIdRef.current
            ) {
              await loadDevMailOutbox();
            }
          }
        }
      } catch (error: unknown) {
        if (
          controller.signal.aborted ||
          isAbortError(error) ||
          !isMountedRef.current ||
          requestId !== bootstrapRequestIdRef.current
        ) return;
        const parsed = normalizeSettingsErrorPayload(error);
        toast({
          title: "Failed to Load Profile",
          description: parsed.message,
          variant: "destructive",
        });
      } finally {
        if (bootstrapAbortControllerRef.current === controller) {
          bootstrapAbortControllerRef.current = null;
        }
        if (
          controller.signal.aborted ||
          !isMountedRef.current ||
          requestId !== bootstrapRequestIdRef.current
        ) return;
        setProfileLoading(false);
      }
    };

    void bootstrap();
  }, [
    abortBootstrapRequest,
    clearSettingsState,
    hydrateCurrentUser,
    isMountedRef,
    loadDevMailOutbox,
    loadManagedUsers,
    loadPendingResetRequests,
    loadSettings,
    toast,
  ]);

  return {
    profileLoading,
  };
}
