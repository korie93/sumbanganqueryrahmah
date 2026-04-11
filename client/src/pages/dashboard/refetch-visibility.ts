type DashboardVisibilityState = DocumentVisibilityState | "prerender" | "unknown";

export const DASHBOARD_PRIMARY_REFETCH_INTERVAL_MS = 30_000;
export const DASHBOARD_SECONDARY_REFETCH_INTERVAL_MS = 60_000;

function readDashboardVisibilityState(): DashboardVisibilityState {
  if (typeof document === "undefined") {
    return "unknown";
  }

  return document.visibilityState;
}

export function resolveVisibleDashboardRefetchInterval(
  intervalMs: number,
  visibilityState: DashboardVisibilityState = readDashboardVisibilityState(),
): number | false {
  return visibilityState === "hidden" ? false : intervalMs;
}
