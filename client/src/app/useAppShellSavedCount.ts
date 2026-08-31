import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { User } from "@/app/types";
import {
  getSavedImportCount,
  SAVED_IMPORTS_CHANGED_EVENT,
} from "@/lib/api/imports";

const SAVED_COUNT_REFRESH_DEBOUNCE_MS = 150;

type UseAppShellSavedCountArgs = {
  currentPage: string;
  setSavedCount: Dispatch<SetStateAction<number>>;
  user: User | null;
};

type SavedCountSyncRuntimeOptions = {
  cancelScheduledRefresh?: ((handle: unknown) => void) | undefined;
  eventTarget: Pick<EventTarget, "addEventListener" | "removeEventListener">;
  fetchCount: (signal: AbortSignal) => Promise<number>;
  onCount: (count: number) => void;
  scheduleRefresh?: ((callback: () => void) => unknown) | undefined;
};

export function startSavedCountSyncRuntime({
  cancelScheduledRefresh = (handle) => {
    globalThis.clearTimeout(handle as ReturnType<typeof setTimeout>);
  },
  eventTarget,
  fetchCount,
  onCount,
  scheduleRefresh = (callback) => globalThis.setTimeout(
    callback,
    SAVED_COUNT_REFRESH_DEBOUNCE_MS,
  ),
}: SavedCountSyncRuntimeOptions) {
  let activeController: AbortController | null = null;
  let scheduledRefresh: unknown = null;
  let stopped = false;

  const syncSavedCount = async () => {
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;

    try {
      const count = await fetchCount(controller.signal);
      if (!stopped && !controller.signal.aborted && activeController === controller) {
        onCount(count);
      }
    } catch {
      // Keep the last known badge value on transient failures such as rate limiting.
    } finally {
      if (activeController === controller) {
        activeController = null;
      }
    }
  };

  const runScheduledRefresh = () => {
    scheduledRefresh = null;
    void syncSavedCount();
  };

  const scheduleSavedCountRefresh = () => {
    if (stopped) {
      return;
    }
    if (scheduledRefresh !== null) {
      cancelScheduledRefresh(scheduledRefresh);
    }
    scheduledRefresh = scheduleRefresh(runScheduledRefresh);
  };

  eventTarget.addEventListener(
    SAVED_IMPORTS_CHANGED_EVENT,
    scheduleSavedCountRefresh,
  );
  void syncSavedCount();

  return () => {
    stopped = true;
    eventTarget.removeEventListener(
      SAVED_IMPORTS_CHANGED_EVENT,
      scheduleSavedCountRefresh,
    );
    if (scheduledRefresh !== null) {
      cancelScheduledRefresh(scheduledRefresh);
      scheduledRefresh = null;
    }
    activeController?.abort();
    activeController = null;
  };
}

export function useAppShellSavedCount(args: UseAppShellSavedCountArgs) {
  const savedCountIdentity = args.user?.id || args.user?.username || null;
  const setSavedCount = args.setSavedCount;
  const userRole = args.user?.role || null;

  useEffect(() => {
    if (!savedCountIdentity || userRole === "user" || userRole === "manager") {
      setSavedCount(0);
      return;
    }

    return startSavedCountSyncRuntime({
      eventTarget: window,
      fetchCount: (signal) => getSavedImportCount({ signal }),
      onCount: setSavedCount,
    });
  }, [savedCountIdentity, setSavedCount, userRole]);
}
