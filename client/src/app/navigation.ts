import type { LucideIcon } from "lucide-react";
import {
  Activity,
  BarChart3,
  BookMarked,
  ClipboardList,
  Database,
  Eye,
  FileText,
  FolderKanban,
  Home,
  LayoutDashboard,
  Search,
  Server,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import {
  canViewActivitySection,
  canViewAnalysisSection,
  canViewAuditSection,
  canViewDashboardSection,
  canViewMonitorSection,
} from "@/app/monitorAccess";
import { parseMonitorSectionFromQuery } from "@/app/routing";
import type { MonitorSection, TabVisibility } from "@/app/types";

export type NavigationEntry = {
  id: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
  title?: string;
  description?: string;
};

export type NavigationGroup = {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
  items: NavigationEntry[];
};

export const HOME_NAV_ITEM: NavigationEntry = {
  id: "home",
  label: "Home",
  icon: Home,
  roles: ["user", "admin", "superuser"],
};

const NAV_ENTRIES: Record<string, NavigationEntry> = {
  home: HOME_NAV_ITEM,
  import: {
    id: "import",
    label: "Import",
    icon: Upload,
    roles: ["user", "admin", "superuser"],
    title: "Import Data",
    description: "Import data from Excel/CSV",
  },
  saved: {
    id: "saved",
    label: "Saved",
    icon: BookMarked,
    roles: ["user", "admin", "superuser"],
    title: "Saved Imports",
    description: "View all saved data",
  },
  viewer: {
    id: "viewer",
    label: "Viewer",
    icon: Eye,
    roles: ["user", "admin", "superuser"],
    title: "Data Viewer",
    description: "Detailed data display",
  },
  "general-search": {
    id: "general-search",
    label: "Search",
    icon: Search,
    roles: ["user", "admin", "superuser"],
    title: "General Search",
    description: "General data search",
  },
  "collection-report": {
    id: "collection-report",
    label: "Collection",
    icon: FileText,
    roles: ["user", "admin", "superuser"],
    title: "Collection Report",
    description: "Save and review collection records",
  },
  dashboard: {
    id: "dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ["user", "admin", "superuser"],
    title: "Dashboard",
    description: "Analytics and system overview",
  },
  activity: {
    id: "activity",
    label: "Activity",
    icon: Activity,
    roles: ["user", "admin", "superuser"],
    title: "Activity Monitor",
    description: "Monitor user activity",
  },
  monitor: {
    id: "monitor",
    label: "System Monitor",
    icon: Server,
    roles: ["user", "admin", "superuser"],
    title: "System Monitor",
    description: "Performance and service health",
  },
  analysis: {
    id: "analysis",
    label: "Analysis",
    icon: BarChart3,
    roles: ["user", "admin", "superuser"],
    title: "Analysis",
    description: "Data analysis and reports",
  },
  "audit-logs": {
    id: "audit-logs",
    label: "Audit Log",
    icon: ClipboardList,
    roles: ["user", "admin", "superuser"],
    title: "Audit Log",
    description: "View system activity logs",
  },
  settings: {
    id: "settings",
    label: "Settings",
    icon: SlidersHorizontal,
    roles: ["user", "admin", "superuser"],
    title: "System Settings",
    description: "Preferences, controls, and account tools",
  },
  backup: {
    id: "backup",
    label: "Backup & Restore",
    icon: Database,
    roles: ["user", "admin", "superuser"],
    title: "Backup & Restore",
    description: "Backup and restore system data",
  },
};

const HOME_ITEM_IDS = [
  "import",
  "saved",
  "viewer",
  "general-search",
  "collection-report",
  "analysis",
  "dashboard",
  "activity",
  "audit-logs",
] as const;

const PRIMARY_NAV_IDS = ["general-search", "collection-report"] as const;
const WORKSPACE_GROUP_ITEM_IDS = ["import", "saved", "viewer"] as const;
const INSIGHTS_GROUP_ITEM_IDS = ["dashboard", "activity", "monitor", "analysis", "audit-logs"] as const;
const SETTINGS_GROUP_ITEM_IDS = ["settings", "backup"] as const;

const MONITOR_TARGET_MAP: Record<string, string> = {
  dashboard: "/monitor?section=dashboard",
  activity: "/monitor?section=activity",
  monitor: "/monitor?section=monitor",
  analysis: "/monitor?section=analysis",
  audit: "/monitor?section=audit",
  "audit-logs": "/monitor?section=audit",
};

function getEntry(id: string) {
  return NAV_ENTRIES[id];
}

function canShowEntry(
  itemId: string,
  userRole: string,
  tabVisibility: TabVisibility,
  featureLockdown = false,
) {
  const item = getEntry(itemId);
  if (!item || !item.roles.includes(userRole)) return false;
  if (featureLockdown) return itemId === "general-search";
  if (userRole === "superuser") return true;

  switch (itemId) {
    case "dashboard":
      return canViewDashboardSection(userRole, tabVisibility);
    case "activity":
      return canViewActivitySection(userRole, tabVisibility);
    case "monitor":
      return canViewMonitorSection(userRole, tabVisibility, true);
    case "analysis":
      return canViewAnalysisSection(userRole, tabVisibility);
    case "audit-logs":
      return canViewAuditSection(userRole, tabVisibility);
    case "backup":
      return tabVisibility ? tabVisibility.backup !== false : true;
    case "settings":
      if (userRole === "user") {
        return canShowEntry("backup", userRole, tabVisibility, featureLockdown);
      }
      return tabVisibility ? tabVisibility.settings !== false : true;
    default:
      return tabVisibility ? tabVisibility[itemId] !== false : true;
  }
}

function mapVisibleEntries(
  itemIds: readonly string[],
  userRole: string,
  tabVisibility: TabVisibility,
  featureLockdown = false,
) {
  return itemIds
    .filter((itemId) => canShowEntry(itemId, userRole, tabVisibility, featureLockdown))
    .map((itemId) => getEntry(itemId));
}

export function getVisiblePrimaryNavItems(
  userRole: string,
  tabVisibility: TabVisibility,
  featureLockdown: boolean,
) {
  return mapVisibleEntries(PRIMARY_NAV_IDS, userRole, tabVisibility, featureLockdown);
}

export function getVisibleNavigationGroups(
  userRole: string,
  tabVisibility: TabVisibility,
  featureLockdown: boolean,
): NavigationGroup[] {
  if (featureLockdown) return [];

  const workspaceItems = mapVisibleEntries(WORKSPACE_GROUP_ITEM_IDS, userRole, tabVisibility);
  const insightsItems = mapVisibleEntries(INSIGHTS_GROUP_ITEM_IDS, userRole, tabVisibility);
  const settingsItems = mapVisibleEntries(SETTINGS_GROUP_ITEM_IDS, userRole, tabVisibility);

  return [
    {
      id: "workspace",
      label: "Workspace",
      description: "Import, review, and revisit operational data modules.",
      icon: FolderKanban,
      items: workspaceItems,
    },
    {
      id: "insights",
      label: "Insights",
      description: "System visibility, monitoring, audit, and analysis views.",
      icon: BarChart3,
      items: insightsItems,
    },
    {
      id: "settings-menu",
      label: "Settings",
      description: "Account controls, configuration, and backup tools.",
      icon: SlidersHorizontal,
      items: settingsItems,
    },
  ].filter((group) => group.items.length > 0);
}

export function getVisibleNavItems(
  userRole: string,
  tabVisibility: TabVisibility,
  featureLockdown: boolean,
) {
  const directItems = getVisiblePrimaryNavItems(userRole, tabVisibility, featureLockdown);
  const groupedItems = getVisibleNavigationGroups(userRole, tabVisibility, featureLockdown).flatMap(
    (group) => group.items,
  );
  const ordered = [HOME_NAV_ITEM, ...directItems, ...groupedItems];
  const seen = new Set<string>();
  return ordered.filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return canShowEntry(item.id, userRole, tabVisibility, featureLockdown);
  });
}

export function getVisibleHomeItems(userRole: string, tabVisibility: TabVisibility) {
  return mapVisibleEntries(HOME_ITEM_IDS, userRole, tabVisibility);
}

export function resolveNavigationTarget(itemId: string) {
  return MONITOR_TARGET_MAP[itemId] || itemId;
}

type ResolveActiveNavigationItemOptions = {
  monitorSection?: MonitorSection | null;
  pathname?: string | null;
  search?: string | null;
};

export function resolveActiveNavigationItemId(
  currentPage: string,
  options: ResolveActiveNavigationItemOptions = {},
) {
  const normalizedPath = String(options.pathname ?? "").toLowerCase();
  const normalizedSearch = options.search ?? "";

  if (currentPage === "audit" || currentPage === "audit-logs") {
    return "audit-logs";
  }

  if (
    currentPage === "monitor"
    || currentPage === "dashboard"
    || currentPage === "activity"
    || currentPage === "analysis"
  ) {
    const resolvedSection = options.monitorSection
      ?? parseMonitorSectionFromQuery(normalizedSearch)
      ?? (currentPage === "monitor" ? "monitor" : currentPage);

    return resolvedSection === "audit" ? "audit-logs" : resolvedSection;
  }

  if (currentPage === "settings" || currentPage === "backup") {
    const settingsSection = new URLSearchParams(normalizedSearch).get("section");
    if (settingsSection === "backup-restore") {
      return "backup";
    }
    return "settings";
  }

  return currentPage;
}

export function formatNavigationLabel(label: string, itemId: string, savedCount?: number) {
  if (itemId === "saved" && savedCount && savedCount > 0) {
    return `${label} (${savedCount})`;
  }
  return label;
}

export function isNavigationItemActive(currentPage: string, itemId: string) {
  if (itemId === "monitor") {
    return ["monitor", "dashboard", "activity", "analysis", "audit", "audit-logs"].includes(currentPage);
  }
  if (itemId === "settings" || itemId === "backup") {
    return currentPage === "settings" || currentPage === "backup";
  }
  return currentPage === itemId;
}

export function isNavigationGroupActive(currentPage: string, group: NavigationGroup) {
  return group.items.some((item) => isNavigationItemActive(currentPage, item.id));
}
