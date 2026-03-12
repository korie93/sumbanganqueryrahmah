import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  BookMarked,
  ClipboardList,
  Database,
  Eye,
  FileText,
  Home,
  LayoutDashboard,
  Search,
  Server,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import type { TabVisibility } from "@/app/types";

type NavigationEntry = {
  id: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
};

type HomeEntry = NavigationEntry & {
  title: string;
  description: string;
};

export const NAV_ITEMS: NavigationEntry[] = [
  { id: "home", label: "Home", icon: Home, roles: ["user", "admin", "superuser"] },
  { id: "import", label: "Import", icon: Upload, roles: ["user", "admin", "superuser"] },
  { id: "saved", label: "Saved", icon: BookMarked, roles: ["user", "admin", "superuser"] },
  { id: "viewer", label: "Viewer", icon: Eye, roles: ["user", "admin", "superuser"] },
  { id: "general-search", label: "Search", icon: Search, roles: ["user", "admin", "superuser"] },
  { id: "collection-report", label: "Collection Report", icon: FileText, roles: ["user", "admin", "superuser"] },
  { id: "monitor", label: "System Monitor", icon: Server, roles: ["user", "admin", "superuser"] },
  { id: "settings", label: "Settings", icon: SlidersHorizontal, roles: ["admin", "superuser"] },
  { id: "backup", label: "Backup", icon: Database, roles: ["user", "admin", "superuser"] },
];

export const HOME_ITEMS: HomeEntry[] = [
  {
    id: "import",
    label: "Import",
    title: "Import Data",
    description: "Import data from Excel/CSV",
    icon: Upload,
    roles: ["user", "admin", "superuser"],
  },
  {
    id: "saved",
    label: "Saved",
    title: "Saved Imports",
    description: "View all saved data",
    icon: BookMarked,
    roles: ["user", "admin", "superuser"],
  },
  {
    id: "viewer",
    label: "Viewer",
    title: "Data Viewer",
    description: "Detailed data display",
    icon: Eye,
    roles: ["user", "admin", "superuser"],
  },
  {
    id: "general-search",
    label: "Search",
    title: "General Search",
    description: "General data search",
    icon: Search,
    roles: ["user", "admin", "superuser"],
  },
  {
    id: "collection-report",
    label: "Collection Report",
    title: "Collection Report",
    description: "Save and review collection records",
    icon: FileText,
    roles: ["user", "admin", "superuser"],
  },
  {
    id: "analysis",
    label: "Analysis",
    title: "Analysis",
    description: "Data analysis and reports",
    icon: BarChart3,
    roles: ["user", "admin", "superuser"],
  },
  {
    id: "dashboard",
    label: "Dashboard",
    title: "Dashboard",
    description: "Analytics and system overview",
    icon: LayoutDashboard,
    roles: ["user", "admin", "superuser"],
  },
  {
    id: "activity",
    label: "Activity",
    title: "Activity Monitor",
    description: "Monitor user activity",
    icon: Activity,
    roles: ["user", "admin", "superuser"],
  },
  {
    id: "audit-logs",
    label: "Audit Log",
    title: "Audit Log",
    description: "View system activity logs",
    icon: ClipboardList,
    roles: ["user", "admin", "superuser"],
  },
  {
    id: "backup",
    label: "Backup",
    title: "Backup & Restore",
    description: "Backup and restore system data",
    icon: Database,
    roles: ["user", "admin", "superuser"],
  },
];

const MONITOR_TARGET_MAP: Record<string, string> = {
  dashboard: "/monitor?section=dashboard",
  activity: "/monitor?section=activity",
  monitor: "/monitor?section=monitor",
  analysis: "/monitor?section=analysis",
  audit: "/monitor?section=audit",
  "audit-logs": "/monitor?section=audit",
};

function canShowMonitorNavigation(userRole: string, tabVisibility: TabVisibility) {
  if (userRole === "superuser") return true;
  if (!tabVisibility) return true;

  const showSystemPerformance = userRole === "admin"
    ? tabVisibility.monitor !== false
    : tabVisibility.monitor === true;
  const showDashboard = tabVisibility.dashboard !== false;
  const showActivity = tabVisibility.activity !== false;
  const showAnalysis = tabVisibility.analysis !== false;
  const showAudit = Object.prototype.hasOwnProperty.call(tabVisibility, "audit")
    ? tabVisibility.audit !== false
    : Object.prototype.hasOwnProperty.call(tabVisibility, "audit-logs")
      ? tabVisibility["audit-logs"] !== false
      : false;

  return showSystemPerformance || showDashboard || showActivity || showAnalysis || showAudit;
}

export function getVisibleNavItems(
  userRole: string,
  tabVisibility: TabVisibility,
  featureLockdown: boolean,
) {
  return NAV_ITEMS.filter((item) => {
    if (!item.roles.includes(userRole)) return false;
    if (featureLockdown) return item.id === "general-search";
    if (item.id === "monitor") return canShowMonitorNavigation(userRole, tabVisibility);
    if (userRole === "superuser") return true;
    if (!tabVisibility) return true;
    return tabVisibility[item.id] !== false;
  });
}

export function getVisibleHomeItems(userRole: string, tabVisibility: TabVisibility) {
  return HOME_ITEMS.filter((item) => {
    if (!item.roles.includes(userRole)) return false;
    if (userRole === "superuser") return true;
    if (!tabVisibility) return true;
    return tabVisibility[item.id] !== false;
  });
}

export function resolveNavigationTarget(itemId: string) {
  return MONITOR_TARGET_MAP[itemId] || itemId;
}

export function formatNavigationLabel(label: string, itemId: string, savedCount?: number) {
  if (itemId === "saved" && savedCount && savedCount > 0) {
    return `${label} (${savedCount})`;
  }
  return label;
}
