import type { MonitorSection, MonitorSectionVisibility, PageName, TabVisibility } from "@/app/types";

export function isSuperuserFeatureOffMode(
  role: string | undefined,
  tabs: TabVisibility,
  tabVisibilityLoaded: boolean,
) {
  if (!role || role === "superuser") return false;
  if (!tabVisibilityLoaded || !tabs) return false;

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
  if (role === "superuser") return true;
  if (role === "admin") {
    if (!tabs) return true;
    return tabs.monitor !== false;
  }
  if (role === "user") {
    if (!tabVisibilityLoaded) return true;
    return tabs?.monitor === true;
  }
  return false;
}

export function canViewDashboardSection(role: string | undefined, tabs: TabVisibility) {
  if (!role || role === "superuser") return true;
  if (!tabs) return true;
  return tabs.dashboard !== false;
}

export function canViewActivitySection(role: string | undefined, tabs: TabVisibility) {
  if (!role || role === "superuser") return true;
  if (!tabs) return true;
  return tabs.activity !== false;
}

export function canViewAnalysisSection(role: string | undefined, tabs: TabVisibility) {
  if (!role || role === "superuser") return true;
  if (!tabs) return true;
  return tabs.analysis !== false;
}

export function canViewAuditSection(role: string | undefined, tabs: TabVisibility) {
  if (!role || role === "superuser") return true;
  if (!tabs) return true;
  if (Object.prototype.hasOwnProperty.call(tabs, "audit")) {
    return tabs.audit !== false;
  }
  if (Object.prototype.hasOwnProperty.call(tabs, "audit-logs")) {
    return tabs["audit-logs"] !== false;
  }
  return false;
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
): PageName {
  if (isSuperuserFeatureOffMode(role, tabs, tabVisibilityLoaded)) return "general-search";
  if (role === "superuser") return "home";

  const candidates: PageName[] = role === "user"
    ? ["general-search"]
    : ["home", "general-search", "saved"];

  for (const candidate of candidates) {
    if (candidate === "general-search" && isSuperuserFeatureOffMode(role, tabs, tabVisibilityLoaded)) {
      return "general-search";
    }
    if (!tabs || tabs[candidate] !== false) return candidate;
  }

  return role === "user" ? "general-search" : "home";
}

export function isPageEnabled(
  role: string | undefined,
  page: PageName,
  tabs: TabVisibility,
  tabVisibilityLoaded: boolean,
) {
  if (isSuperuserFeatureOffMode(role, tabs, tabVisibilityLoaded)) {
    return page === "general-search" || page === "forbidden" || page === "maintenance";
  }

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
  if (page === "dashboard") return canViewDashboardSection(role, tabs);
  if (page === "activity") return canViewActivitySection(role, tabs);
  if (page === "analysis") return canViewAnalysisSection(role, tabs);
  if (page === "audit" || page === "audit-logs") return canViewAuditSection(role, tabs);
  if (!role || role === "superuser") return true;
  if (!tabs) return true;
  return tabs[page] !== false;
}
