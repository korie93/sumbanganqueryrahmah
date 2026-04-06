import { formatOperationalDateTime } from "@/lib/date-format";
import type { ParsedBrowserInfo } from "@/pages/activity/types";

export function getBannedUsersPanelTitleClassName(isMobile: boolean) {
  return `${isMobile ? "mb-3 text-base" : "mb-4 text-lg"} flex items-center gap-2 font-semibold text-foreground`;
}

export function getBannedUserCardClassName(isMobile: boolean) {
  return `bg-destructive/5 border border-destructive/20 ${isMobile ? "rounded-2xl p-3.5" : "rounded-lg p-4"}`;
}

export function getBannedUserIpText(ipAddress?: string | null, includePrefix = false) {
  const resolvedIpAddress = ipAddress || "Unknown IP";
  return includePrefix ? `IP: ${resolvedIpAddress}` : resolvedIpAddress;
}

export function getBannedUserBrowserText(
  parsedBrowser: ParsedBrowserInfo | null,
  fallback = "Unknown browser",
) {
  if (!parsedBrowser) {
    return fallback;
  }

  return parsedBrowser.version
    ? `${parsedBrowser.browser} ${parsedBrowser.version}`
    : parsedBrowser.browser;
}

export function getBannedUserTimestampText(bannedAt?: string | null, includePrefix = false) {
  const formatted = bannedAt
    ? formatOperationalDateTime(bannedAt, { fallback: "Unknown" })
    : "Unknown";

  return includePrefix ? `Banned: ${formatted}` : formatted;
}
