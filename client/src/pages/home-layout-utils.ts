import type { NavigationEntry } from "@/app/navigation";

export type DesktopHomeSections = {
  primaryActions: NavigationEntry[];
  workspaceItems: NavigationEntry[];
  insightsItems: NavigationEntry[];
  overflowItems: NavigationEntry[];
};

export type MobileHomeSections = {
  heroActions: NavigationEntry[];
  quickActions: NavigationEntry[];
  secondaryItems: NavigationEntry[];
};

function prioritizeNavigationEntries(
  visibleItems: readonly NavigationEntry[],
  ids: readonly string[],
): NavigationEntry[] {
  return ids
    .map((id) => visibleItems.find((item) => item.id === id))
    .filter((item): item is NavigationEntry => Boolean(item));
}

export function buildDesktopHomeSections(
  visibleItems: readonly NavigationEntry[],
): DesktopHomeSections {
  const primaryActionPriority = ["general-search", "collection-report", "dashboard"] as const;
  const workspacePriority = ["import", "saved", "viewer"] as const;
  const insightsPriority = ["activity", "analysis", "audit-logs"] as const;

  const primaryActions = prioritizeNavigationEntries(visibleItems, primaryActionPriority);
  const workspaceItems = prioritizeNavigationEntries(visibleItems, workspacePriority);
  const insightsItems = prioritizeNavigationEntries(visibleItems, insightsPriority);
  const usedIds = new Set([
    ...primaryActions.map((item) => item.id),
    ...workspaceItems.map((item) => item.id),
    ...insightsItems.map((item) => item.id),
  ]);
  const overflowItems = visibleItems.filter((item) => !usedIds.has(item.id));

  return {
    primaryActions,
    workspaceItems,
    insightsItems,
    overflowItems,
  };
}

export function buildMobileHomeSections(
  visibleItems: readonly NavigationEntry[],
): MobileHomeSections {
  const quickActionPriority = [
    "general-search",
    "collection-report",
    "viewer",
    "dashboard",
  ] as const;
  const heroActionPriority = ["general-search", "collection-report"] as const;
  const prioritizedQuickActions = prioritizeNavigationEntries(visibleItems, quickActionPriority);
  const prioritizedQuickActionIds = new Set(prioritizedQuickActions.map((item) => item.id));
  const fallbackQuickActions = visibleItems.filter((item) => !prioritizedQuickActionIds.has(item.id));
  const quickActions = [...prioritizedQuickActions, ...fallbackQuickActions].slice(0, 4);
  const quickActionIds = new Set(quickActions.map((item) => item.id));
  const secondaryItems = visibleItems.filter((item) => !quickActionIds.has(item.id));
  const heroActions = prioritizeNavigationEntries(visibleItems, heroActionPriority);

  return {
    heroActions: heroActions.length > 0 ? heroActions : quickActions.slice(0, 2),
    quickActions,
    secondaryItems,
  };
}
