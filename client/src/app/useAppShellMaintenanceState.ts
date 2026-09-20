import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { User } from "@/app/types";
import { getMaintenanceStatus } from "@/lib/api";
import { getBrowserLocalStorage, safeSetStorageItem } from "@/lib/browser-storage";
import { logClientWarning } from "@/lib/client-logger";
import { useTimers } from "@/hooks/useTimers";
import { MAINTENANCE_STATUS_POLL_INTERVAL_MS } from "@/pages/maintenance-state";
import { buildPathForPage, replaceHistory } from "@/app/routing";
import { shouldRedirectForMaintenance } from "@/app/maintenance-client-policy";

type MaintenanceUpdatedDetail = {
  maintenance?: boolean;
  type?: unknown;
};

type UseAppShellMaintenanceStateArgs = {
  currentPage: string;
  setCurrentPage: Dispatch<SetStateAction<string>>;
  user: User | null;
};

const MAINTENANCE_POLL_ERROR_WARNING_COOLDOWN_MS = 60_000;

export function shouldPollAppShellMaintenance(currentPage: string, user: Pick<User, "role"> | null) {
  // Once the status page is open, its explicit recovery action owns checking
  // and leaving that page. Keep the existing entry polling everywhere else.
  return user !== null && user.role !== "admin" && user.role !== "superuser"
    && currentPage !== "maintenance";
}

export function isMaintenancePollingAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function shouldReportMaintenancePollingError(
  error: unknown,
  nowMs: number,
  lastReportedAtMs: number,
  cooldownMs = MAINTENANCE_POLL_ERROR_WARNING_COOLDOWN_MS,
) {
  if (isMaintenancePollingAbortError(error)) {
    return false;
  }

  return lastReportedAtMs <= 0 || nowMs - lastReportedAtMs >= cooldownMs;
}

export function useAppShellMaintenanceState({
  currentPage,
  setCurrentPage,
  user,
}: UseAppShellMaintenanceStateArgs) {
  const { clearManagedInterval, setManagedInterval } = useTimers();

  useEffect(() => {
    const onMaintenanceUpdated = (event: Event) => {
      if (currentPage === "maintenance") return;
      const custom = event as CustomEvent<MaintenanceUpdatedDetail>;
      if (shouldRedirectForMaintenance(custom.detail, user?.role)) {
        setCurrentPage("maintenance");
        replaceHistory(buildPathForPage("maintenance"));
      }
    };

    window.addEventListener("maintenance-updated", onMaintenanceUpdated);
    return () => window.removeEventListener("maintenance-updated", onMaintenanceUpdated);
  }, [currentPage, setCurrentPage, user]);

  useEffect(() => {
    if (!user || !shouldPollAppShellMaintenance(currentPage, user)) return;
    let cancelled = false;
    let activeController: AbortController | null = null;
    let lastPollingWarningAtMs = 0;
    const storage = getBrowserLocalStorage();

    const canPollNow = () =>
      typeof document === "undefined" || document.visibilityState === "visible";

    const checkMaintenance = async () => {
      if (!canPollNow()) {
        return;
      }
      try {
        activeController?.abort();
        const controller = new AbortController();
        activeController = controller;
        const state = await getMaintenanceStatus({ signal: controller.signal });
        if (cancelled) return;

        if (shouldRedirectForMaintenance(state, user.role)) {
          safeSetStorageItem(storage, "maintenanceState", JSON.stringify(state));
          setCurrentPage("maintenance");
          replaceHistory(buildPathForPage("maintenance"));
        } else {
          if (state?.maintenance === true) {
            safeSetStorageItem(storage, "maintenanceState", JSON.stringify(state));
          }
        }
      } catch (error) {
        if (isMaintenancePollingAbortError(error)) {
          return;
        }
        const nowMs = Date.now();
        if (
          import.meta.env.DEV
          && shouldReportMaintenancePollingError(error, nowMs, lastPollingWarningAtMs)
        ) {
          lastPollingWarningAtMs = nowMs;
          logClientWarning("Maintenance polling failed; keeping the current app state.", error);
        }
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void checkMaintenance();
      }
    };

    void checkMaintenance();
    const timer = setManagedInterval(checkMaintenance, MAINTENANCE_STATUS_POLL_INTERVAL_MS);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleVisibilityChange);
    }
    return () => {
      cancelled = true;
      activeController?.abort();
      activeController = null;
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
      clearManagedInterval(timer);
    };
  }, [clearManagedInterval, currentPage, setCurrentPage, setManagedInterval, user]);
}
