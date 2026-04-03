import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, ShieldAlert, TimerReset, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMaintenanceStatus } from "@/lib/api/settings";
import { formatDateTimeDDMMYYYY } from "@/lib/date-format";
import {
  mergeMaintenancePayload,
  parseStoredMaintenanceState,
  type MaintenancePayload,
} from "@/pages/maintenance-state";

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

    setState((previous) => parseStoredMaintenanceState(localStorage.getItem("maintenanceState"), previous));

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
          localStorage.setItem("maintenanceState", JSON.stringify(latest));
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        // keep last known state
      }
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

    load();
    const poll = setInterval(load, 15_000);
    window.addEventListener("maintenance-updated", handleMaintenanceUpdated as EventListener);
    window.addEventListener("storage", handleStorage);

    return () => {
      mounted = false;
      activeController?.abort();
      activeController = null;
      window.removeEventListener("maintenance-updated", handleMaintenanceUpdated as EventListener);
      window.removeEventListener("storage", handleStorage);
      clearInterval(poll);
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
    <div className="viewport-min-height bg-gradient-to-br from-[#0b1220] via-[#101a2d] to-[#14213d] text-slate-100 flex items-center justify-center p-4 sm:p-6">
      <Card className="w-full max-w-3xl border-slate-700/80 bg-slate-900/75 backdrop-blur-md shadow-2xl">
        <CardHeader className="space-y-4 border-b border-slate-800 pb-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-amber-300">
              <ShieldAlert className="w-5 h-5" />
              <span className="text-xs sm:text-sm uppercase tracking-wide">Penyelenggaraan Sistem</span>
            </div>
            <div className="rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs text-slate-300">
              {state.type === "hard" ? "Mod Penuh" : "Mod Lembut"}
            </div>
          </div>
          <CardTitle className="text-2xl sm:text-3xl font-bold text-slate-100">Sistem Sedang Diselenggara</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 pt-6">
          <div className="rounded-lg border border-slate-700/90 bg-slate-800/70 p-4">
            <p className="text-slate-100 leading-relaxed">{state.message}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
              <p className="text-slate-400 mb-1">Status</p>
              <p className="font-semibold">{state.maintenance ? "Aktif" : "Tidak Aktif"}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
              <p className="text-slate-400 mb-1">Masa Mula</p>
              <p className="font-semibold text-xs sm:text-sm">{formatTime(state.startTime)}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-3">
              <p className="text-slate-400 mb-1">Masa Tamat</p>
              <p className="font-semibold text-xs sm:text-sm">{formatTime(state.endTime)}</p>
            </div>
          </div>

          {countdown && (
            <div className="rounded-lg border border-blue-700/50 bg-blue-950/40 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-2">
                <Clock3 className="w-5 h-5 text-blue-300" />
                <p className="text-xs text-blue-200">Anggaran tamat maintenance</p>
              </div>
              <div className="inline-flex items-center gap-2 rounded-md border border-blue-700/50 px-3 py-1 bg-blue-900/20">
                <TimerReset className="w-4 h-4 text-blue-200" />
                <p className="text-2xl font-semibold tracking-wide text-blue-100 font-mono">{countdown}</p>
              </div>
            </div>
          )}

          <div className="text-xs text-slate-400 flex items-center gap-2 rounded-md border border-slate-800 bg-slate-900/50 p-3">
            <Wrench className="w-4 h-4" />
            <AlertTriangle className="w-4 h-4" />
            Jika anda admin atau superuser, log masuk semula untuk akses yang dibenarkan semasa penyelenggaraan.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
