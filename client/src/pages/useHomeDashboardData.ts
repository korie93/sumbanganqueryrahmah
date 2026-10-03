import { useCallback, useEffect, useRef, useState } from "react";
import { getCollectionMonthlySummary } from "@/lib/api/collection-reports";
import { getRecentLoginActivity } from "@/lib/api/analytics";
import { logClientError } from "@/lib/client-logger";
import { COLLECTION_DATA_CHANGED_EVENT } from "@/pages/collection/utils";
import { createHomeRequestGate, getHomeBusinessDate } from "./home-dashboard-utils";

export type HomeDataState<T> =
  | { status: "loading"; data?: undefined }
  | { status: "error"; data?: undefined }
  | { status: "ready" | "empty"; data: T };

export function useHomeBusinessDate() {
  const [date, setDate] = useState(() => getHomeBusinessDate());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const refresh = () => {
      const next = getHomeBusinessDate();
      setDate(next);
      clearTimeout(timer);
      timer = setTimeout(refresh, Math.max(100, next.nextMidnight - Date.now() + 50));
    };
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    refresh();
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);
  return date;
}

export type HomeCollectionResponse = Awaited<ReturnType<typeof getCollectionMonthlySummary>>;

export function useHomeCollectionData(year: number, month: number, dateKey: string) {
  const gate = useRef(createHomeRequestGate());
  const [state, setState] = useState<HomeDataState<HomeCollectionResponse>>({ status: "loading" });
  const load = useCallback(async () => {
    const request = gate.current.begin();
    if (!request) return;
    setState({ status: "loading" });
    try {
      const data = await getCollectionMonthlySummary({ year, dashboardMonth: month }, {
        signal: request.controller.signal,
        // The production timeout is retained; a caller signal otherwise disables it.
        timeoutMs: 60_000,
      });
      if (!gate.current.isCurrent(request.sequence)) return;
      const row = data.summary.find((entry) => entry.month === month);
      setState({ status: (row?.totalRecords ?? 0) === 0 ? "empty" : "ready", data });
    } catch (error) {
      if (!gate.current.isCurrent(request.sequence) || (error instanceof Error && error.name === "AbortError")) return;
      logClientError("Home Collection summary could not be loaded", error);
      setState({ status: "error" });
    } finally { gate.current.finish(request.sequence); }
  }, [month, year]);
  useEffect(() => {
    const currentGate = gate.current;
    void load();
    const onChanged = () => { currentGate.cancel(); void load(); };
    window.addEventListener(COLLECTION_DATA_CHANGED_EVENT, onChanged);
    return () => { currentGate.cancel(); window.removeEventListener(COLLECTION_DATA_CHANGED_EVENT, onChanged); };
  }, [load, dateKey]);
  return { state, retry: () => { void load(); } };
}

export function useHomeRecentActivity() {
  const [state, setState] = useState<HomeDataState<Awaited<ReturnType<typeof getRecentLoginActivity>>>>({ status: "loading" });
  useEffect(() => {
    let current = true;
    void getRecentLoginActivity(5).then((data) => {
      if (current) setState({ status: data.length ? "ready" : "empty", data });
    }).catch((error: unknown) => {
      if (!current) return;
      logClientError("Home recent activity could not be loaded", error);
      setState({ status: "error" });
    });
    return () => { current = false; };
  }, []);
  return state;
}
