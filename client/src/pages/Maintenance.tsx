import { useEffect, useState } from "react";
import { getMaintenanceStatus } from "@/lib/api/settings";
import { getBrowserLocalStorage, safeGetStorageItem, safeSetStorageItem } from "@/lib/browser-storage";
import { formatDateTimeDDMMYYYY } from "@/lib/date-format";
import { mergeMaintenancePayload, parseStoredMaintenanceState, type MaintenancePayload } from "@/pages/maintenance-state";
import { SystemStatusView } from "@/components/system-status/SystemStatusView";
import { useServiceRecovery } from "@/components/system-status/useServiceRecovery";
import "@/components/system-status/SystemStatusPage.css";

const DEFAULT_STATE: MaintenancePayload = {
  maintenance: true, message: "", type: "hard", startTime: null, endTime: null,
};

export default function MaintenancePage() {
  const [details, setDetails] = useState<MaintenancePayload>(() =>
    parseStoredMaintenanceState(safeGetStorageItem(getBrowserLocalStorage(), "maintenanceState"), DEFAULT_STATE));
  const recovery = useServiceRecovery("maintenance");

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    // Existing maintenance source, not another toggle or a health polling loop.
    void getMaintenanceStatus({ signal: controller.signal }).then((latest) => {
      if (controller.signal.aborted) return;
      setDetails((previous) => mergeMaintenancePayload(previous, latest));
      safeSetStorageItem(getBrowserLocalStorage(), "maintenanceState", JSON.stringify(latest));
    }).catch(() => {}).finally(() => window.clearTimeout(timeout));
    const updated = (event: Event) => setDetails((previous) =>
      mergeMaintenancePayload(previous, (event as CustomEvent<Partial<MaintenancePayload>>).detail));
    window.addEventListener("maintenance-updated", updated);
    return () => {
      controller.abort();
      window.clearTimeout(timeout);
      window.removeEventListener("maintenance-updated", updated);
    };
  }, []);

  const eta = details.endTime ? formatDateTimeDDMMYYYY(details.endTime, { fallback: "" }) : "";
  return <SystemStatusView state={recovery.state} busy={recovery.busy} feedback={recovery.feedback}
    primary={recovery.state === "restored" ? { label: "Sambung ke SQR", href: "/" }
      : { label: "Cuba Semula", onClick: () => { void recovery.check(); } }}
    secondary={{ label: "Kembali ke Log Masuk", href: "/login" }}>
    {recovery.state === "maintenance" && details.maintenance && (details.message || eta) ? <>
      {details.message ? <p>{details.message}</p> : null}
      {eta ? <p>Anggaran tamat: <strong>{eta}</strong>. Masa ini tertakluk kepada perubahan.</p> : null}
    </> : null}
  </SystemStatusView>;
}
