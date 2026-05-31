import { useEffect, useState } from "react";
import { AlertTriangle, Wrench } from "lucide-react";
import {
  mergeMaintenancePayload,
  parseStoredMaintenanceState,
  type MaintenancePayload,
} from "@/pages/maintenance-state";
import {
  getBrowserLocalStorage,
  safeGetStorageItem,
} from "@/lib/browser-storage";
import { shouldShowSoftMaintenanceBanner } from "@/app/maintenance-client-policy";
import "./MaintenanceModeBanner.css";

const EMPTY_MAINTENANCE_STATE: MaintenancePayload = {
  maintenance: false,
  message: "",
  type: "soft",
  startTime: null,
  endTime: null,
};

function readStoredMaintenanceState() {
  const storage = getBrowserLocalStorage();
  return parseStoredMaintenanceState(
    safeGetStorageItem(storage, "maintenanceState"),
    EMPTY_MAINTENANCE_STATE,
  );
}

type MaintenanceModeBannerProps = {
  userRole: string;
};

export default function MaintenanceModeBanner({ userRole }: MaintenanceModeBannerProps) {
  const [state, setState] = useState<MaintenancePayload>(() => readStoredMaintenanceState());

  useEffect(() => {
    const handleMaintenanceUpdated = (event: Event) => {
      const detail = (event as CustomEvent<Partial<MaintenancePayload>>).detail;
      setState((previous) => mergeMaintenancePayload(previous, detail));
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "maintenanceState") {
        return;
      }

      setState((previous) => parseStoredMaintenanceState(event.newValue, previous));
    };

    window.addEventListener("maintenance-updated", handleMaintenanceUpdated);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("maintenance-updated", handleMaintenanceUpdated);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  if (!shouldShowSoftMaintenanceBanner(state, userRole)) {
    return null;
  }

  return (
    <section
      className="app-maintenance-banner"
      role="status"
      aria-live="polite"
      aria-label="Notis soft maintenance"
    >
      <div className="app-maintenance-banner__inner">
        <span className="app-maintenance-banner__icon" aria-hidden="true">
          <Wrench className="h-4 w-4" />
        </span>
        <div className="app-maintenance-banner__content">
          <div className="app-maintenance-banner__heading">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" focusable="false" />
            <span>Soft maintenance aktif</span>
          </div>
          <p>{state.message || "Sebahagian modul sedang diselenggara. Kerja lain boleh diteruskan."}</p>
        </div>
        <span className="app-maintenance-banner__scope">Search, Imports, AI</span>
      </div>
    </section>
  );
}
