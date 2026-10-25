import { parseMonitorSectionFromPageInput } from "@/app/routing";

export type NavigationPrefetchTarget =
  | "home"
  | "import"
  | "saved"
  | "viewer"
  | "general-search"
  | "collection-report"
  | "dashboard"
  | "activity"
  | "monitor"
  | "analysis"
  | "audit-logs"
  | "settings"
  | "backup"
  | "ai";

export function normalizeNavigationPrefetchTarget(target: string): NavigationPrefetchTarget | null {
  const normalizedTarget = String(target || "").trim();
  if (!normalizedTarget) {
    return null;
  }

  const monitorSection = parseMonitorSectionFromPageInput(normalizedTarget);
  if (monitorSection === "audit") {
    return "audit-logs";
  }
  if (
    monitorSection === "dashboard" ||
    monitorSection === "activity" ||
    monitorSection === "monitor" ||
    monitorSection === "analysis"
  ) {
    return monitorSection;
  }

  if (
    normalizedTarget === "home" ||
    normalizedTarget === "import" ||
    normalizedTarget === "saved" ||
    normalizedTarget === "viewer" ||
    normalizedTarget === "general-search" ||
    normalizedTarget === "collection-report" ||
    normalizedTarget === "settings" ||
    normalizedTarget === "backup" ||
    normalizedTarget === "ai" ||
    normalizedTarget === "audit-logs"
  ) {
    return normalizedTarget;
  }

  if (!normalizedTarget.startsWith("/")) {
    return null;
  }

  try {
    const url = new URL(normalizedTarget, "https://app.local");
    if (url.pathname === "/") {
      return "home";
    }
    if (url.pathname === "/settings") {
      return url.searchParams.get("section") === "backup-restore" ? "backup" : "settings";
    }
    if (url.pathname === "/collection/save" || url.pathname.startsWith("/collection/")) {
      return "collection-report";
    }
  } catch {
    return null;
  }

  return null;
}
