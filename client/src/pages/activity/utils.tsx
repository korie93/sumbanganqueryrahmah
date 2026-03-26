import { Badge } from "@/components/ui/badge";
import type { ActivityFilters } from "@/lib/api";
import { getStoredRole } from "@/lib/auth-session";
import { formatDateTimeDDMMYYYY } from "@/lib/date-format";
import type { ActivityRecord, ActivityStatus, ParsedBrowserInfo } from "@/pages/activity/types";

export function getCurrentActivityRole() {
  return getStoredRole();
}

export function hasActiveActivityFilters(filters: ActivityFilters) {
  return Boolean(
    (filters.status && filters.status.length > 0) ||
    filters.username ||
    filters.ipAddress ||
    filters.browser ||
    filters.dateFrom ||
    filters.dateTo,
  );
}

export function getActivityFilterCount(filters: ActivityFilters) {
  return (
    (filters.status?.length || 0) +
    (filters.username ? 1 : 0) +
    (filters.ipAddress ? 1 : 0) +
    (filters.browser ? 1 : 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0)
  );
}

export function formatActivityTime(dateStr: string) {
  if (!dateStr) return "-";
  return formatDateTimeDDMMYYYY(dateStr, { fallback: "-" });
}

export function getSessionDuration(loginTime: string, logoutTime?: string) {
  try {
    const start = new Date(loginTime).getTime();
    const end = logoutTime ? new Date(logoutTime).getTime() : Date.now();
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

export function getStatusBadge(status: ActivityStatus) {
  switch (status) {
    case "ONLINE":
      return <Badge className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20">ONLINE</Badge>;
    case "IDLE":
      return <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20">IDLE</Badge>;
    case "LOGOUT":
      return <Badge variant="secondary">LOGOUT</Badge>;
    case "KICKED":
      return <Badge className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20">KICKED</Badge>;
    case "BANNED":
      return <Badge variant="destructive">BANNED</Badge>;
  }
}

export function parseActivityUserAgent(ua?: string): ParsedBrowserInfo {
  if (!ua) return { browser: "Unknown", version: "" };

  if (!ua.includes("Mozilla/") && !ua.includes("AppleWebKit")) {
    const parts = ua.split(" ");
    return { browser: parts[0] || ua, version: parts[1] || "" };
  }

  if (ua.includes("DuckDuckGo/")) {
    return { browser: "DuckDuckGo", version: ua.match(/DuckDuckGo\/(\d+)/)?.[1] || "" };
  }
  if (ua.includes("Vivaldi/")) {
    return { browser: "Vivaldi", version: ua.match(/Vivaldi\/(\d+)/)?.[1] || "" };
  }
  if (ua.includes("Brave/") || ua.includes("Brave")) {
    return { browser: "Brave", version: ua.match(/Chrome\/(\d+)/)?.[1] || "" };
  }
  if (ua.includes("OPR/") || ua.includes("Opera/")) {
    return { browser: "Opera", version: ua.match(/OPR\/(\d+)/)?.[1] || ua.match(/Opera\/(\d+)/)?.[1] || "" };
  }
  if (ua.includes("Edg/") || ua.includes("Edge/")) {
    return { browser: "Edge", version: ua.match(/Edg\/(\d+)/)?.[1] || ua.match(/Edge\/(\d+)/)?.[1] || "" };
  }
  if (ua.includes("Firefox/")) {
    return { browser: "Firefox", version: ua.match(/Firefox\/(\d+)/)?.[1] || "" };
  }
  if (ua.includes("Chrome/")) {
    return { browser: "Chrome", version: ua.match(/Chrome\/(\d+)/)?.[1] || "" };
  }
  if (ua.includes("Safari/") && !ua.includes("Chrome")) {
    return { browser: "Safari", version: ua.match(/Version\/(\d+)/)?.[1] || "" };
  }
  if (ua.includes("curl/")) {
    return { browser: "curl", version: ua.match(/curl\/(\d+)/)?.[1] || "" };
  }

  return { browser: "Unknown", version: "" };
}

export function countActivitiesByStatus(activities: ActivityRecord[], status: ActivityStatus) {
  return activities.filter((activity) => activity.status === status).length;
}
