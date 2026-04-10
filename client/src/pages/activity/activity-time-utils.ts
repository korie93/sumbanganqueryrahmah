import { formatOperationalDateTime, parseDateValue } from "@/lib/date-format";

export function formatActivityTime(dateStr: string) {
  if (!dateStr) return "-";
  return formatOperationalDateTime(dateStr, { fallback: "-" });
}

export function getSessionDuration(loginTime: string, logoutTime?: string) {
  try {
    const start = parseDateValue(loginTime)?.getTime() ?? Number.NaN;
    const end = logoutTime
      ? (parseDateValue(logoutTime)?.getTime() ?? Number.NaN)
      : Date.now();

    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
      return "-";
    }

    const diffMs = end - start;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "< 1 min";
    if (diffMins < 60) return `${diffMins} min`;

    const diffHours = Math.floor(diffMins / 60);
    const remainingMins = diffMins % 60;
    if (diffHours < 24) return `${diffHours}h ${remainingMins}m`;

    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ${diffHours % 24}h`;
  } catch {
    return "-";
  }
}
