import type { MonitorSection } from "@/app/types";

export type ResolvedRoute = {
  page: string;
  monitorSection?: MonitorSection;
  normalizedPath?: string;
};

const PUBLIC_AUTH_ROUTES = new Set([
  "login",
  "forgot-password",
  "activate-account",
  "reset-password",
]);

const LEGACY_MONITOR_ROUTES: Record<string, MonitorSection> = {
  "/dashboard": "dashboard",
  "/activity": "activity",
  "/analysis": "analysis",
  "/audit": "audit",
  "/audit-logs": "audit",
};

const DIRECT_APP_ROUTE_ALIASES: Record<string, string> = {
  "/search": "general-search",
  "/general-search": "general-search",
  "/import": "import",
  "/saved": "saved",
  "/viewer": "viewer",
};

export function parseMonitorSectionFromQuery(search: string): MonitorSection | null {
  const section = new URLSearchParams(search).get("section");
  if (
    section === "dashboard" ||
    section === "activity" ||
    section === "monitor" ||
    section === "analysis" ||
    section === "audit"
  ) {
    return section;
  }
  if (section === "audit-logs") return "audit";
  return null;
}

export function parseMonitorSectionFromPageInput(page: string): MonitorSection | null {
  const normalizedPage = page.trim();
  if (!normalizedPage) return null;

  if (normalizedPage === "monitor") return "monitor";
  if (normalizedPage === "dashboard") return "dashboard";
  if (normalizedPage === "activity") return "activity";
  if (normalizedPage === "analysis") return "analysis";
  if (normalizedPage === "audit" || normalizedPage === "audit-logs") return "audit";
  if (!normalizedPage.toLowerCase().startsWith("/monitor")) return null;

  try {
    const url = new URL(normalizedPage, "https://app.local");
    if (url.pathname.toLowerCase() !== "/monitor") return null;
    return parseMonitorSectionFromQuery(url.search) || "monitor";
  } catch {
    return null;
  }
}

export function resolveRouteFromLocation(pathname: string, search: string): ResolvedRoute | null {
  const normalizedPath = pathname.toLowerCase();
  const legacyMonitorSection = LEGACY_MONITOR_ROUTES[normalizedPath];
  const directAliasPage = DIRECT_APP_ROUTE_ALIASES[normalizedPath];

  if (normalizedPath === "/") {
    return { page: "home" };
  }
  if (normalizedPath === "/login") {
    return { page: "login" };
  }
  if (normalizedPath === "/maintenance") {
    return { page: "maintenance" };
  }
  if (normalizedPath === "/forgot-password") {
    return { page: "forgot-password" };
  }
  if (normalizedPath === "/activate-account") {
    return { page: "activate-account" };
  }
  if (normalizedPath === "/reset-password") {
    return { page: "reset-password" };
  }
  if (normalizedPath === "/change-password") {
    return { page: "change-password" };
  }
  if (normalizedPath === "/settings") {
    return { page: "settings" };
  }
  if (normalizedPath === "/collection-report" || normalizedPath.startsWith("/collection/")) {
    return { page: "collection-report" };
  }
  if (directAliasPage) {
    return { page: directAliasPage };
  }
  if (legacyMonitorSection) {
    return {
      page: "monitor",
      monitorSection: legacyMonitorSection,
      normalizedPath: buildPathForPage("monitor", legacyMonitorSection),
    };
  }
  if (normalizedPath === "/monitor") {
    return {
      page: "monitor",
      monitorSection: parseMonitorSectionFromQuery(search) || "monitor",
    };
  }
  if (normalizedPath === "/403") {
    return { page: "forbidden" };
  }
  if (normalizedPath === "/404") {
    return { page: "not-found" };
  }

  return null;
}

export function isPublicAuthRoutePage(page: string) {
  return PUBLIC_AUTH_ROUTES.has(String(page || "").trim());
}

export function buildPathForPage(page: string, monitorSection: MonitorSection = "monitor") {
  if (page === "home") return "/";
  if (page === "general-search") return "/general-search";
  if (page === "import") return "/import";
  if (page === "saved") return "/saved";
  if (page === "viewer") return "/viewer";
  if (page === "login") return "/login";
  if (page === "settings") return "/settings";
  if (page === "backup") return "/settings?section=backup-restore";
  if (page === "collection-report") return "/collection/save";
  if (page === "maintenance") return "/maintenance";
  if (page === "forgot-password") return "/forgot-password";
  if (page === "activate-account") return "/activate-account";
  if (page === "reset-password") return "/reset-password";
  if (page === "change-password") return "/change-password";
  if (page === "forbidden") return "/403";
  if (page === "not-found") return "/404";
  if (page === "monitor") return `/monitor?section=${monitorSection}`;
  return "/";
}

export function replaceHistory(path: string) {
  if (typeof window === "undefined") return;
  const currentPath = `${window.location.pathname}${window.location.search}`;
  if (currentPath !== path) {
    window.history.replaceState({}, "", path);
  }
}
