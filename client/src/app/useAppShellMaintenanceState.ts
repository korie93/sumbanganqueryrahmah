import { useEffect, type Dispatch, type SetStateAction } from "react";
import type { User } from "@/app/types";
import { getMaintenanceStatus } from "@/lib/api";

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

    const checkMaintenance = async () => {
      try {
        const state = await getMaintenanceStatus();
        if (cancelled) return;

        if (state?.maintenance === true) {
          localStorage.setItem("maintenanceState", JSON.stringify(state));
          setCurrentPage("maintenance");
        } else if (currentPage === "maintenance") {
          setCurrentPage("general-search");
        }
      } catch {
        // Ignore maintenance polling errors.
      }
    };

    void checkMaintenance();
    const timer = window.setInterval(checkMaintenance, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentPage, setCurrentPage, user]);
}
