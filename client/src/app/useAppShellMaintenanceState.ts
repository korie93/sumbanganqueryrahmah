import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { User } from "@/app/types";
import { getMaintenanceStatus } from "@/lib/api";
import { getBrowserLocalStorage, safeSetStorageItem } from "@/lib/browser-storage";
import { logClientWarning } from "@/lib/client-logger";
import { MAINTENANCE_STATUS_POLL_INTERVAL_MS } from "@/pages/maintenance-state";

type MaintenanceUpdatedDetail = {
  maintenance?: boolean;
};

type UseAppShellMaintenanceStateArgs = {
  currentPage: string;
  setCurrentPage: Dispatch<SetStateAction<string>>;
  user: User | null;
};

const MAINTENANCE_POLL_ERROR_WARNING_COOLDOWN_MS = 60_000;

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
  useEffect(() => {
    const onMaintenanceUpdated = (event: Event) => {
      const custom = event as CustomEvent<MaintenanceUpdatedDetail>;
      if (custom.detail?.maintenance) {
        setCurrentPage("maintenance");
      } else if (currentPage === "maintenance") {
        setCurrentPage(user?.role === "user" ? "general-search" : "home");
      }
    };

    window.addEventListener("maintenance-updated", onMaintenanceUpdated as EventListener);
    return () => window.removeEventListener("maintenance-updated", onMaintenanceUpdated as EventListener);
  }, [currentPage, setCurrentPage, user]);

  useEffect(() => {
    if (!user || user.role === "admin" || user.role === "superuser") return;
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

        if (state?.maintenance === true) {
          safeSetStorageItem(storage, "maintenanceState", JSON.stringify(state));
          setCurrentPage("maintenance");
        } else if (currentPage === "maintenance") {
          setCurrentPage("general-search");
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
    const timer = window.setInterval(checkMaintenance, MAINTENANCE_STATUS_POLL_INTERVAL_MS);
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
      window.clearInterval(timer);
    };
  }, [currentPage, setCurrentPage, user]);
}
