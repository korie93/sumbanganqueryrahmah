import { getBrowserLocalStorage, safeSetStorageItem } from "@/lib/browser-storage";
import { shouldRedirectForMaintenance } from "@/app/maintenance-client-policy";

export type MaintenanceNavigationPayload = Record<string, unknown> & {
  maintenance?: unknown;
};

export function notifyMaintenanceMode(payload: MaintenanceNavigationPayload) {
  safeSetStorageItem(getBrowserLocalStorage(), "maintenanceState", JSON.stringify(payload));
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("maintenance-updated", {
      detail: payload,
    }),
  );

  const currentPath = `${window.location.pathname}${window.location.search}`;
  if (shouldRedirectForMaintenance(payload, "user") && currentPath !== "/maintenance") {
    window.history.replaceState({}, "", "/maintenance");
  }
}
