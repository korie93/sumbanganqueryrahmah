import { canAccessRoleFeature } from "@shared/role-feature-access";
import type { MonitorSection, MonitorSectionVisibility, TabVisibility } from "@/app/types";

export function isSuperuserFeatureOffMode(
  role: string | undefined,
  tabs: TabVisibility,
  tabVisibilityLoaded: boolean,
) {
  if (!role || role === "superuser") return false;
  if (!tabVisibilityLoaded || !tabs) return false;
  if (!canAccessRoleFeature(role, "general-search", tabs)) return false;

  const nonSearchEntries = Object.entries(tabs).filter(
    ([key]) => key !== "general-search" && key !== "canViewSystemPerformance",
  );

  if (nonSearchEntries.length === 0) return false;
  return nonSearchEntries.every(([, enabled]) => enabled === false);
}

export function canViewMonitorSection(
  role: string | undefined,
  tabs: TabVisibility,
  tabVisibilityLoaded: boolean,
) {
  return (role === "superuser" || tabVisibilityLoaded)
    && canAccessRoleFeature(role, "monitor", tabs);
}

export function canViewDashboardSection(role: string | undefined, tabs: TabVisibility) {
  return canAccessRoleFeature(role, "dashboard", tabs);
}

export function canViewActivitySection(role: string | undefined, tabs: TabVisibility) {
  return canAccessRoleFeature(role, "activity", tabs);
}

export function canViewAnalysisSection(role: string | undefined, tabs: TabVisibility) {
  return canAccessRoleFeature(role, "analysis", tabs);
}

export function canViewAuditSection(role: string | undefined, tabs: TabVisibility) {
  return canAccessRoleFeature(role, "audit-logs", tabs);
}

export function getMonitorSectionVisibility(
  role: string | undefined,
  tabs: TabVisibility,
  tabVisibilityLoaded: boolean,
): MonitorSectionVisibility {
  return {
    dashboard: canViewDashboardSection(role, tabs),
    activity: canViewActivitySection(role, tabs),
    monitor: canViewMonitorSection(role, tabs, tabVisibilityLoaded),
    analysis: canViewAnalysisSection(role, tabs),
    audit: canViewAuditSection(role, tabs),
  };
}

export function getDefaultMonitorSection(
  role: string | undefined,
  tabs: TabVisibility,
  tabVisibilityLoaded: boolean,
): MonitorSection {
  const visibility = getMonitorSectionVisibility(role, tabs, tabVisibilityLoaded);
  if (visibility.monitor) return "monitor";
  if (visibility.dashboard) return "dashboard";
  if (visibility.activity) return "activity";
  if (visibility.analysis) return "analysis";
  if (visibility.audit) return "audit";
  return "monitor";
}

export function getDefaultPageForRole(
  role: string,
  tabs: TabVisibility,
  tabVisibilityLoaded: boolean,
) {
  if (role === "superuser") return "home";
  if (!tabVisibilityLoaded) return "forbidden";
  const candidates = [
    ...(role === "user" ? ["general-search", "home"] : ["home", "general-search"]),
    "collection-report", "import", "saved", "viewer", "settings", "backup",
  ];
  const ordinaryPage = candidates.find((page) => canAccessRoleFeature(role, page, tabs));
  if (ordinaryPage) return ordinaryPage;
  return Object.values(getMonitorSectionVisibility(role, tabs, tabVisibilityLoaded)).some(Boolean)
    ? "monitor" : "forbidden";
}

export function isPageEnabled(
  role: string | undefined,
  page: string,
  tabs: TabVisibility,
  tabVisibilityLoaded: boolean,
) {
  if (["forbidden", "maintenance", "change-password", "not-found"].includes(page)) return true;
  if (role !== "superuser" && !tabVisibilityLoaded) return false;
  // AI has its own runtime control, not a configurable Role & Permission tab.
  if (page === "ai") return role === "admin" || role === "user" || role === "superuser";
  if (page === "monitor") {
    const visibility = getMonitorSectionVisibility(role, tabs, tabVisibilityLoaded);
    return (
      visibility.monitor ||
      visibility.dashboard ||
      visibility.activity ||
      visibility.analysis ||
      visibility.audit
    );
  }
  return canAccessRoleFeature(role, page, tabs);
}
