import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, ShieldAlert, TimerReset, Wrench } from "lucide-react";
import { getMaintenanceStatus } from "@/lib/api/settings";
import { getBrowserLocalStorage, safeGetStorageItem, safeSetStorageItem } from "@/lib/browser-storage";
import { formatDateTimeDDMMYYYY } from "@/lib/date-format";
import {
  mergeMaintenancePayload,
  parseStoredMaintenanceState,
  type MaintenancePayload,
} from "@/pages/maintenance-state";
import "./Maintenance.css";

const DEFAULT_MAINTENANCE_STATE: MaintenancePayload = {
  maintenance: true,
  message: "Sistem sedang diselenggara. Sila cuba semula sebentar lagi.",
  type: "hard",
  startTime: null,
  endTime: null,
};

function formatCountdown(endTime: string | null, now: number) {
  if (!endTime) return null;
  const target = new Date(endTime).getTime();
  if (Number.isNaN(target)) return null;
  const diff = target - now;
  if (diff <= 0) return "00:00:00";
  const totalSec = Math.floor(diff / 1000);
  const hh = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const mm = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const ss = String(totalSec % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default function MaintenancePage() {
  const [state, setState] = useState<MaintenancePayload>(DEFAULT_MAINTENANCE_STATE);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let mounted = true;
    let activeController: AbortController | null = null;
    let pollIntervalId: number | null = null;
    const storage = getBrowserLocalStorage();

    setState((previous) => parseStoredMaintenanceState(safeGetStorageItem(storage, "maintenanceState"), previous));

    const load = async () => {
      try {
        activeController?.abort();
        const controller = new AbortController();
        activeController = controller;
        const latest = await getMaintenanceStatus({ signal: controller.signal });
        if (!mounted || controller.signal.aborted) {
          return;
        }
        if (latest && typeof latest === "object") {
          setState((prev) => mergeMaintenancePayload(prev, latest));
          safeSetStorageItem(storage, "maintenanceState", JSON.stringify(latest));
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        // keep last known state
      }
    };

    const stopPolling = () => {
      if (pollIntervalId !== null) {
        window.clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
    };

    const startPolling = () => {
      if (document.hidden || pollIntervalId !== null) {
        return;
      }
      pollIntervalId = window.setInterval(() => {
        void load();
      }, 15_000);
    };

    const handleMaintenanceUpdated = (event: Event) => {
      const nextState = (event as CustomEvent<Partial<MaintenancePayload>>).detail;
      if (!mounted) {
        return;
      }
      setState((previous) => mergeMaintenancePayload(previous, nextState));
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "maintenanceState" || !mounted) {
        return;
      }
      setState((previous) => parseStoredMaintenanceState(event.newValue, previous));
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        activeController?.abort();
        stopPolling();
        return;
      }

      void load();
      startPolling();
    };

    void load();
    startPolling();
    window.addEventListener("maintenance-updated", handleMaintenanceUpdated as EventListener);
    window.addEventListener("storage", handleStorage);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mounted = false;
      activeController?.abort();
      activeController = null;
      window.removeEventListener("maintenance-updated", handleMaintenanceUpdated as EventListener);
      window.removeEventListener("storage", handleStorage);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopPolling();
    };
  }, []);

  const countdownTargetMs = useMemo(() => {
    if (!state.endTime) {
      return null;
    }
    const target = new Date(state.endTime).getTime();
    return Number.isNaN(target) ? null : target;
  }, [state.endTime]);

  useEffect(() => {
    if (countdownTargetMs === null) {
      return;
    }

    setNow(Date.now());
    const tick = window.setInterval(() => {
      const nextNow = Date.now();
      setNow(nextNow);
      if (nextNow >= countdownTargetMs) {
        window.clearInterval(tick);
      }
    }, 1000);

    return () => {
      window.clearInterval(tick);
    };
  }, [countdownTargetMs]);

  const countdown = useMemo(
    () => formatCountdown(state.endTime || null, now),
    [state.endTime, now]
  );

  const formatTime = (raw?: string | null) => {
    if (!raw) return "-";
    return formatDateTimeDDMMYYYY(raw, { fallback: "-" });
  };

  return (
    <main className="maintenance-page viewport-min-height flex items-center justify-center p-4 sm:p-6">
      <section
        className="maintenance-page__shell w-full max-w-3xl rounded-3xl backdrop-blur-md"
        aria-labelledby="maintenance-page-title"
      >
        <header className="maintenance-page__header space-y-4 px-6 pb-6 pt-6 sm:px-8">
          <div className="flex items-center justify-between gap-3">
            <p className="maintenance-page__kicker flex items-center gap-2">
              <ShieldAlert className="w-5 h-5" />
              <span className="text-xs sm:text-sm uppercase tracking-wide">Penyelenggaraan Sistem</span>
            </p>
            <div className="maintenance-page__badge rounded-full px-3 py-1 text-xs">
              {state.type === "hard" ? "Mod Penuh" : "Mod Lembut"}
            </div>
          </div>
          <h1 id="maintenance-page-title" className="maintenance-page__title text-2xl font-bold sm:text-3xl">
            Sistem Sedang Diselenggara
          </h1>
        </header>
        <div className="space-y-5 px-6 pb-6 pt-6 sm:px-8">
          <div className="maintenance-page__message rounded-lg p-4">
            <p className="leading-relaxed">{state.message}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="maintenance-page__panel rounded-lg p-3">
              <p className="maintenance-page__panel-label mb-1">Status</p>
              <p className="maintenance-page__panel-value font-semibold">{state.maintenance ? "Aktif" : "Tidak Aktif"}</p>
            </div>
            <div className="maintenance-page__panel rounded-lg p-3">
              <p className="maintenance-page__panel-label mb-1">Masa Mula</p>
              <p className="maintenance-page__panel-value font-semibold text-xs sm:text-sm">{formatTime(state.startTime)}</p>
            </div>
            <div className="maintenance-page__panel rounded-lg p-3">
              <p className="maintenance-page__panel-label mb-1">Masa Tamat</p>
              <p className="maintenance-page__panel-value font-semibold text-xs sm:text-sm">{formatTime(state.endTime)}</p>
            </div>
          </div>

          {countdown && (
            <div className="maintenance-page__countdown rounded-lg p-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <Clock3 className="maintenance-page__countdown-icon w-5 h-5" />
                <p className="maintenance-page__countdown-label text-xs">Anggaran tamat maintenance</p>
              </div>
              <div className="maintenance-page__countdown-chip inline-flex items-center gap-2 rounded-md px-3 py-1">
                <TimerReset className="maintenance-page__countdown-chip-icon w-4 h-4" />
                <p className="maintenance-page__countdown-value text-2xl font-semibold tracking-wide font-mono">{countdown}</p>
              </div>
            </div>
          )}

          <div className="maintenance-page__info flex items-center gap-2 rounded-md p-3 text-xs">
            <Wrench className="maintenance-page__info-icon w-4 h-4" />
            <AlertTriangle className="maintenance-page__info-icon w-4 h-4" />
            Jika anda admin atau superuser, log masuk semula untuk akses yang dibenarkan semasa penyelenggaraan.
          </div>
        </div>
      </section>
    </main>
  );
}
