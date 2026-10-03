import { memo, useCallback, useMemo } from "react";
import { getVisibleHomeItems, resolveNavigationTarget } from "@/app/navigation";
import { prefetchNavigationTargetWithDiagnostics } from "@/app/navigation-prefetch";
import type { User } from "@/app/types";
import { HomeDashboardLayout } from "./HomeSections";
import { useHomeBusinessDate } from "./useHomeDashboardData";
import "./Home.css";

interface HomeProps {
  onNavigate: (page: string, importId?: string) => void;
  userRole: string;
  user?: User | undefined;
  tabVisibility?: Record<string, boolean> | null;
}

function HomeImpl({ onNavigate, userRole, user, tabVisibility }: HomeProps) {
  const date = useHomeBusinessDate();
  const visibleItems = useMemo(
    () => getVisibleHomeItems(userRole, tabVisibility ?? null), [tabVisibility, userRole],
  );
  const navigateToItem = useCallback((itemId: string) => {
    if (visibleItems.some((item) => item.id === itemId)) onNavigate(resolveNavigationTarget(itemId));
  }, [onNavigate, visibleItems]);
  const prefetchTarget = useCallback((itemId: string) => {
    if (!visibleItems.some((item) => item.id === itemId)) return;
    void prefetchNavigationTargetWithDiagnostics(resolveNavigationTarget(itemId), { source: "home", itemId });
  }, [visibleItems]);

  return <HomeDashboardLayout
    key={`${user?.id ?? user?.username ?? ""}:${userRole}`}
    date={date}
    displayName={user?.fullName || user?.username || ""}
    visibleItems={visibleItems}
    onNavigateItem={navigateToItem}
    onPrefetchItem={prefetchTarget}
  />;
}

export default memo(HomeImpl);
