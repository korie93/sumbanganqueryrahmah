import type { ActivityFilters } from "@/lib/api";

export type ActivityStatus = "ONLINE" | "IDLE" | "LOGOUT" | "KICKED" | "BANNED";

export interface ActivityRecord {
  id: string;
  username: string;
  role: string;
  status: ActivityStatus;
  pcName?: string;
  browser?: string;
  fingerprint?: string;
  ipAddress?: string;
  loginTime: string;
  logoutTime?: string;
  lastActivityTime?: string;
  isActive: boolean;
  logoutReason?: string;
}

export interface BannedUser {
  visitorId: string;
  banId?: string;
  username: string;
  role: string;
  banInfo?: {
    ipAddress: string | null;
    browser: string | null;
    bannedAt: string | null;
  };
}

export interface ParsedBrowserInfo {
  browser: string;
  version: string;
}

export const DEFAULT_ACTIVITY_FILTERS: ActivityFilters = {
  status: [],
  username: "",
  ipAddress: "",
  browser: "",
  dateFrom: "",
  dateTo: "",
};

export const STATUS_OPTIONS: { value: ActivityStatus; label: string }[] = [
  { value: "ONLINE", label: "Online" },
  { value: "IDLE", label: "Idle" },
  { value: "LOGOUT", label: "Logout" },
  { value: "KICKED", label: "Kicked" },
  { value: "BANNED", label: "Banned" },
];
