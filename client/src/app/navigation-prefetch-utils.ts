import { getVisibleHomeItems, getVisibleNavItems, resolveNavigationTarget } from "@/app/navigation";
import { parseMonitorSectionFromPageInput } from "@/app/routing";
import type { MonitorSection, PageName, TabVisibility } from "@/app/types";

type PredictivePrefetchArgs = {
  currentPage: PageName;
  featureLockdown: boolean;
  monitorSection?: MonitorSection | null | undefined;
  tabVisibility: TabVisibility;
  userRole: string;
};

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

const NAVIGATION_PREFETCH_PRIORITY: NavigationPrefetchTarget[] = [
  "general-search",
  "collection-report",
  "viewer",
  "saved",
  "dashboard",
  "settings",
  "backup",
  "import",
  "activity",
  "monitor",
  "analysis",
  "audit-logs",
  "ai",
];

const MAX_PREDICTIVE_PREFETCH_TARGETS = 4;

function dedupeTargets(targets: Array<NavigationPrefetchTarget | null>): NavigationPrefetchTarget[] {
  const seen = new Set<NavigationPrefetchTarget>();
  return targets.filter((target): target is NavigationPrefetchTarget => {
    if (!target || seen.has(target)) {
      return false;
    }
    seen.add(target);
    return true;
  });
}

function getNavigationPriority(target: NavigationPrefetchTarget) {
  const index = NAVIGATION_PREFETCH_PRIORITY.indexOf(target);
  return index === -1 ? NAVIGATION_PREFETCH_PRIORITY.length : index;
}

function resolveCurrentNavigationTarget(
  currentPage: PageName,
  monitorSection?: MonitorSection | null | undefined,
): NavigationPrefetchTarget | null {
  if (currentPage === "monitor") {
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
  }

  return normalizeNavigationPrefetchTarget(currentPage);
}

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

export function resolvePredictivePrefetchTargets({
  currentPage,
  featureLockdown,
  monitorSection,
  tabVisibility,
  userRole,
}: PredictivePrefetchArgs): NavigationPrefetchTarget[] {
  if (featureLockdown) {
    return currentPage === "general-search" ? [] : ["general-search"];
  }

  const prioritizedSourceIds = currentPage === "home"
    ? getVisibleHomeItems(userRole, tabVisibility).map((item) => item.id)
    : getVisibleNavItems(userRole, tabVisibility, featureLockdown)
      .map((item) => item.id)
      .filter((itemId) => itemId !== "home");

  const normalizedCandidates = dedupeTargets([
    ...prioritizedSourceIds.map((itemId) =>
      normalizeNavigationPrefetchTarget(resolveNavigationTarget(itemId))),
    ...NAVIGATION_PREFETCH_PRIORITY,
  ]);
  const currentTarget = resolveCurrentNavigationTarget(currentPage, monitorSection);

  return normalizedCandidates
    .filter((target) => target !== currentTarget)
    .sort((left, right) => getNavigationPriority(left) - getNavigationPriority(right))
    .slice(0, MAX_PREDICTIVE_PREFETCH_TARGETS);
}
