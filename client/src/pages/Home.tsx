import { memo, useCallback, useMemo } from "react";
import { getVisibleHomeItems, resolveNavigationTarget } from "@/app/navigation";
import { prefetchNavigationTargetWithDiagnostics } from "@/app/navigation-prefetch";
import { useIsMobile } from "@/hooks/use-mobile";
import { HomeDesktopLayout, HomeMobileLayout } from "./HomeSections";
import {
  buildDesktopHomeSections,
  buildMobileHomeSections,
} from "./home-layout-utils";
import "./Home.css";

interface HomeProps {
  onNavigate: (page: string, importId?: string) => void;
  userRole: string;
  tabVisibility?: Record<string, boolean> | null;
}

function HomeImpl({ onNavigate, userRole, tabVisibility }: HomeProps) {
  const isMobile = useIsMobile();
  const visibleItems = useMemo(
    () => getVisibleHomeItems(userRole, tabVisibility || null),
    [tabVisibility, userRole],
  );
  const desktopHomeSections = useMemo(
    () => buildDesktopHomeSections(visibleItems),
    [visibleItems],
  );
  const mobileHomeSections = useMemo(
    () => buildMobileHomeSections(visibleItems),
    [visibleItems],
  );
  const navigateToItem = useCallback((itemId: string) => {
    onNavigate(resolveNavigationTarget(itemId));
  }, [onNavigate]);
  const prefetchTarget = useCallback((itemId: string) => {
    void prefetchNavigationTargetWithDiagnostics(resolveNavigationTarget(itemId), {
      source: "home",
      itemId,
    });
  }, []);

  if (isMobile) {
    return (
      <HomeMobileLayout
        sections={mobileHomeSections}
        userRole={userRole}
        visibleItemsCount={visibleItems.length}
        onNavigateItem={navigateToItem}
        onPrefetchItem={prefetchTarget}
      />
    );
  }

  return (
    <HomeDesktopLayout
      sections={desktopHomeSections}
      userRole={userRole}
      visibleItemsCount={visibleItems.length}
      onNavigateItem={navigateToItem}
      onPrefetchItem={prefetchTarget}
    />
  );
}

export default memo(HomeImpl);
