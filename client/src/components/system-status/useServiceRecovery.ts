import { useCallback, useEffect, useRef, useState } from "react";
import type { SystemStatusKind } from "@shared/system-status";
import { checkServiceRecovery } from "./recovery-check";

// Re-read after each await/event; the network state can change during a check.
function isBrowserOffline() { return navigator.onLine === false; }

export function useServiceRecovery(initialState: SystemStatusKind) {
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const active = useRef<AbortController | null>(null);
  const nextAllowed = useRef(0);
  const mounted = useRef(true);

  const check = useCallback(async () => {
    if (active.current || document.hidden) return;
    if (Date.now() < nextAllowed.current) { setFeedback("Tunggu sebentar sebelum menyemak semula."); return; }
    nextAllowed.current = Date.now() + 3_000;
    if (isBrowserOffline()) { setState("offline"); setFeedback("Semak sambungan rangkaian peranti anda."); return; }
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setFeedback("Menyemak sambungan…");
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    try {
      const result = await checkServiceRecovery(controller.signal);
      if (!mounted.current) return;
      controller.signal.throwIfAborted();
      setState(result === "unavailable" ? initialState : result);
      setFeedback(result === "restored" ? "Sambungan disahkan. Anda boleh sambung ke SQR."
        : result === "maintenance" ? "Penyelenggaraan masih aktif. Sila cuba semula kemudian."
        : "Perkhidmatan belum dapat disahkan. Sila cuba semula sebentar lagi.");
    } catch {
      if (!mounted.current) return;
      setState(isBrowserOffline() ? "offline" : initialState);
      setFeedback(document.hidden ? "Semakan dijeda. Cuba semula apabila anda bersedia."
        : "Sambungan belum dapat disahkan. Sila cuba semula sebentar lagi.");
    } finally {
      window.clearTimeout(timeout);
      if (active.current === controller) active.current = null;
      if (mounted.current) setBusy(false);
    }
  }, [initialState]);

  useEffect(() => {
    mounted.current = true;
    const offline = () => { active.current?.abort(); setState("offline"); setFeedback("Semak sambungan rangkaian peranti anda."); };
    const online = () => { setFeedback("Rangkaian dikesan. Tekan Cuba Semula untuk mengesahkan perkhidmatan."); };
    const visibility = () => { if (document.hidden) active.current?.abort(); };
    if (isBrowserOffline()) offline();
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange", visibility);
    return () => { mounted.current = false; active.current?.abort(); window.removeEventListener("offline", offline);
      window.removeEventListener("online", online); document.removeEventListener("visibilitychange", visibility); };
  }, []);
  return { state, busy, feedback, check };
}
