import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { User } from "@/app/types";
import { getMaintenanceStatus } from "@/lib/api";
import { getBrowserLocalStorage, safeSetStorageItem } from "@/lib/browser-storage";

type MaintenanceUpdatedDetail = {
  maintenance?: boolean;
};

type UseAppShellMaintenanceStateArgs = {
  currentPage: string;
  setCurrentPage: Dispatch<SetStateAction<string>>;
  user: User | null;
};

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
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        // Ignore maintenance polling errors.
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void checkMaintenance();
      }
    };

    void checkMaintenance();
    const timer = window.setInterval(checkMaintenance, 15000);
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
