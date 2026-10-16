import { useEffect, useState } from "react";
import { getCollectionDailyTodayDate } from "@/pages/collection/useCollectionDailyPeriod";

/** Refresh the Malaysia calendar day after midnight or when returning to the tab. */
export function useCollectionDailyClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const update = () => {
      const current = new Date();
      setNow((previous) => getCollectionDailyTodayDate(previous) === getCollectionDailyTodayDate(current)
        ? previous : current);
    };
    const onVisibility = () => { if (document.visibilityState === "visible") update(); };
    const timer = window.setInterval(update, 60_000);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return now;
}
