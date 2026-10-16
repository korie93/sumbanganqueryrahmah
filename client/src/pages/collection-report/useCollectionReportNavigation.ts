import {
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  FolderPlus,
  LayoutGrid,
  ListChecks,
  Settings2,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import type {
  CollectionSidebarItem,
  CollectionSubPage,
} from "@/pages/collection-report/types";
import {
  getPathForSubPage,
  getSubPageFromPath,
} from "@/pages/collection-report/utils";

type UseCollectionReportNavigationArgs = {
  canAccessBilling: boolean;
  canAccessNicknameSummary: boolean;
  isReadOnlyManager: boolean;
  isSuperuser: boolean;
};

export function isCollectionNavigationPath(pathname: string) {
  const normalized = pathname.toLowerCase();
  return normalized === "/collection"
    || normalized === "/collection-report"
    || normalized.startsWith("/collection/");
}

export function useCollectionReportNavigation({
  canAccessBilling,
  canAccessNicknameSummary,
  isReadOnlyManager,
  isSuperuser,
}: UseCollectionReportNavigationArgs) {
  const [pathname, navigate] = useLocation();
  const requestedSubPage = getSubPageFromPath(pathname || "/collection/save");
  const defaultSubPage = isReadOnlyManager ? "records" : "save";
  // The route owns the selected section, including browser history and deep links.
  // Apply the existing role guards before rendering a section or its active state.
  const subPage = (
    (requestedSubPage === "billing-principal" && !canAccessBilling)
    || (requestedSubPage === "save" && isReadOnlyManager)
    || (requestedSubPage === "manage-nicknames" && !isSuperuser)
    || (requestedSubPage === "nickname-summary" && !canAccessNicknameSummary)
  ) ? defaultSubPage : requestedSubPage;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const sidebarItems = useMemo<CollectionSidebarItem[]>(() => {
    const items: CollectionSidebarItem[] = [
      ...(!isReadOnlyManager ? [{
        key: "save",
        label: "Simpan Collection Individual",
        icon: FolderPlus,
        description: "Rekod kutipan individu dan resit berkaitan.",
      } satisfies CollectionSidebarItem] : []),
      {
        key: "records",
        label: "View Rekod Collection",
        icon: ListChecks,
        description: "Semak, tapis, dan kemas kini rekod collection.",
      },
      {
        key: "summary",
        label: "Collection Summary",
        icon: LayoutGrid,
        description: "Pantau ringkasan bulanan keseluruhan mengikut tahun.",
      },
      {
        key: "monthly-comparison",
        label: "Monthly Comparison",
        icon: BarChart3,
        description: "Bandingkan trend bulanan bagi satu nickname terpilih.",
      },
      {
        key: "daily",
        label: "Collection Daily",
        icon: CalendarDays,
        description: "Jejaki prestasi harian dan kalendar collection.",
      },
      ...(canAccessBilling ? [{
        key: "billing-principal",
        label: "Billing Principal (OSP)",
        icon: CircleDollarSign,
        description: "Semak target sistem dan keputusan client peribadi.",
      } satisfies CollectionSidebarItem] : []),
    ];
    if (canAccessNicknameSummary) {
      items.push({
        key: "nickname-summary",
        label: "Nickname Summary",
        icon: Users,
        description: "Bandingkan beberapa nickname dalam satu julat tarikh.",
      });
    }
    if (isSuperuser) {
      items.push({
        key: "manage-nicknames",
        label: "Manage Nickname",
        icon: Settings2,
        description: "Urus senarai nickname dan akses collection.",
      });
    }
    return items;
  }, [canAccessBilling, canAccessNicknameSummary, isReadOnlyManager, isSuperuser]);

  const activeSidebarItem = useMemo(
    () => sidebarItems.find((item) => item.key === subPage) || sidebarItems[0],
    [sidebarItems, subPage],
  );

  useEffect(() => {
    // Do not intercept a global navigation while this workspace is still mounted.
    if (typeof window === "undefined" || !isCollectionNavigationPath(pathname)) return;
    const targetPath = getPathForSubPage(subPage);
    if (pathname.toLowerCase() !== targetPath.toLowerCase()) {
      navigate(targetPath, { replace: true });
    }
  }, [navigate, pathname, subPage]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [subPage]);

  const handleSelectSubPage = useCallback((nextSubPage: CollectionSubPage) => {
    if (!sidebarItems.some((item) => item.key === nextSubPage)) return;
    const targetPath = getPathForSubPage(nextSubPage);
    if (pathname.toLowerCase() !== targetPath.toLowerCase()) {
      // A deliberate section change adds a history entry; corrections above do not.
      navigate(targetPath);
    }
    setMobileSidebarOpen(false);
  }, [navigate, pathname, sidebarItems]);

  return {
    subPage,
    sidebarCollapsed,
    mobileSidebarOpen,
    sidebarItems,
    activeSidebarItem,
    setSidebarCollapsed,
    setMobileSidebarOpen,
    handleSelectSubPage,
  };
}

export type CollectionReportNavigationValue = ReturnType<
  typeof useCollectionReportNavigation
>;
