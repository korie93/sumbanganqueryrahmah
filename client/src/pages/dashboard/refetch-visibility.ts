type DashboardVisibilityState = DocumentVisibilityState | "prerender" | "unknown";

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
