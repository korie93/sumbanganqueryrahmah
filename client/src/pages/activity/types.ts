import type {
  ActivityApiRecord,
  ActivityFilters,
  ActivitySortBy,
  ActivitySortOrder,
  ActivityStatus,
} from "@/lib/api";

export type { ActivitySortBy, ActivitySortOrder, ActivityStatus };

export type ActivityRecord = ActivityApiRecord;

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

export interface ActivityLogsTableProps {
  actionLoading: string | null;
  activities: ActivityRecord[];
  canModerateActivity: boolean;
  loading: boolean;
  logsOpen: boolean;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  sortBy: ActivitySortBy;
  sortOrder: ActivitySortOrder;
  onBanClick: (activity: ActivityRecord) => void;
  onDeleteClick: (activity: ActivityRecord) => void;
  onKickClick: (activity: ActivityRecord) => void;
  onInvestigateClick: (activity: ActivityRecord) => void;
  onLogsOpenChange: (open: boolean) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onSortChange: (sortBy: ActivitySortBy, sortOrder: ActivitySortOrder) => void;
  onToggleSelected: (activityId: string, checked: boolean) => void;
  onToggleSelectAllVisible: (checked: boolean) => void;
  selectedActivityIds: Set<string>;
  allVisibleSelected: boolean;
  partiallySelected: boolean;
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
