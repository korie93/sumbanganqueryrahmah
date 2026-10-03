import type { NavigationEntry } from "@/app/navigation";

/** All inputs have already been authorized by the shared production navigation registry. */
export function buildHomeDashboardSections(visibleItems: readonly NavigationEntry[]) {
  const quickIds = ["general-search", "collection-report"];
  return {
    quickAccess: quickIds.flatMap((id) => visibleItems.filter((item) => item.id === id)),
    operational: visibleItems.filter((item) => !quickIds.includes(item.id)),
    canViewCollection: visibleItems.some((item) => item.id === "collection-report"),
    canViewRecentActivity: visibleItems.some((item) => item.id === "dashboard"),
  };
}
