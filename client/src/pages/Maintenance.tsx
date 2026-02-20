import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getMaintenanceStatus } from "@/lib/api";

type MaintenancePayload = {
  maintenance: boolean;
  message: string;
  type: "soft" | "hard";
  startTime?: string | null;
  endTime?: string | null;
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
  const [state, setState] = useState<MaintenancePayload>({
    maintenance: true,
    message: "Sistem sedang diselenggara. Sila cuba semula sebentar lagi.",
    type: "hard",
    startTime: null,
    endTime: null,
  });
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const cached = localStorage.getItem("maintenanceState");
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setState((prev) => ({ ...prev, ...parsed }));
      } catch {
        // ignore cache parse issue
      }
    }

    const load = async () => {
      try {
        const latest = await getMaintenanceStatus();
        if (latest && typeof latest === "object") {
          setState((prev) => ({ ...prev, ...latest }));
          localStorage.setItem("maintenanceState", JSON.stringify(latest));
        }
      } catch {
        // keep last known state
      }
    };
    load();
    const poll = setInterval(load, 15_000);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, []);

  const countdown = useMemo(
    () => formatCountdown(state.endTime || null, now),
    [state.endTime, now]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 text-slate-100 flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl border-slate-700 bg-slate-900/80 backdrop-blur">
        <CardHeader className="space-y-3">
          <div className="flex items-center gap-2 text-amber-400">
            <ShieldAlert className="w-5 h-5" />
            <span className="text-sm uppercase tracking-wide">System Maintenance</span>
          </div>
          <CardTitle className="text-3xl font-bold text-slate-100">SQR Sedang Diselenggara</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-lg border border-slate-700 bg-slate-800/60 p-4">
            <p className="text-slate-100 leading-relaxed">{state.message}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
              <p className="text-slate-400">Mode</p>
              <p className="font-semibold uppercase">{state.type}</p>
            </div>
            <div className="rounded-lg border border-slate-700 bg-slate-800/50 p-3">
              <p className="text-slate-400">Status</p>
              <p className="font-semibold">{state.maintenance ? "Aktif" : "Tidak Aktif"}</p>
            </div>
          </div>

          {countdown && (
            <div className="rounded-lg border border-blue-700/50 bg-blue-950/40 p-4 flex items-center gap-3">
              <Clock3 className="w-5 h-5 text-blue-300" />
              <div>
                <p className="text-xs text-blue-200">Anggaran Tamat Maintenance</p>
                <p className="text-2xl font-semibold text-blue-100">{countdown}</p>
              </div>
            </div>
          )}

          <div className="text-xs text-slate-400 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Jika anda admin/superuser, log masuk semula untuk bypass maintenance mode.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
