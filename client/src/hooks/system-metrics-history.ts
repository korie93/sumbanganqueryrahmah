import type {
  MonitorHistory,
  MonitorSnapshot,
} from "@/hooks/system-metrics-types";
import { HISTORY_KEYS } from "./system-metrics-initial-state";
import { getSnapshotValueByHistoryKey } from "./system-metrics-derived-utils";

const ROLLING_LIMIT = 60;

export const appendHistorySnapshot = (
  previousHistory: MonitorHistory,
  snapshot: MonitorSnapshot,
  ts: number,
) => {
  let nextHistory = previousHistory;

  for (const key of HISTORY_KEYS) {
    const value = getSnapshotValueByHistoryKey(snapshot, key);
    const currentSeries = previousHistory[key];
    const lastPoint = currentSeries[currentSeries.length - 1];

    if (lastPoint && lastPoint.value === value) {
      continue;
    }

    const nextSeries = currentSeries.length >= ROLLING_LIMIT
      ? [...currentSeries.slice(currentSeries.length - ROLLING_LIMIT + 1), { ts, value }]
      : [...currentSeries, { ts, value }];

    if (nextHistory === previousHistory) {
      nextHistory = { ...previousHistory };
    }

    nextHistory[key] = nextSeries;
  }

  return nextHistory;
};
