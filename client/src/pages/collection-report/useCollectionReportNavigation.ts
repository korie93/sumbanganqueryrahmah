import { BarChart3, CalendarDays, FolderPlus, ListChecks, Settings2, Users } from "lucide-react";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";
import type {
  CollectionSidebarItem,
  CollectionSubPage,
} from "@/pages/collection-report/types";
import {
  getPathForSubPage,
  getSubPageFromPath,
} from "@/pages/collection-report/utils";

type UseCollectionReportNavigationArgs = {
  canAccessNicknameSummary: boolean;
  isSuperuser: boolean;
};

export function useCollectionReportNavigation({
  canAccessNicknameSummary,
  isSuperuser,
}: UseCollectionReportNavigationArgs) {
  const [subPage, setSubPage] = useState<CollectionSubPage>(() => {
    if (typeof window === "undefined") return "save";
    return getSubPageFromPath(window.location.pathname || "/collection/save");
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  const sidebarItems = useMemo<CollectionSidebarItem[]>(() => {
    const items: CollectionSidebarItem[] = [
      { key: "save", label: "Simpan Collection Individual", icon: FolderPlus },
      { key: "records", label: "View Rekod Collection", icon: ListChecks },
      { key: "summary", label: "Collection Summary", icon: BarChart3 },
      { key: "daily", label: "Collection Daily", icon: CalendarDays },
    ];
    if (canAccessNicknameSummary) {
      items.push({
        key: "nickname-summary",
        label: "Nickname Summary",
        icon: Users,
      });
    }
    if (isSuperuser) {
      items.push({
        key: "manage-nicknames",
        label: "Manage Nickname",
        icon: Settings2,
      });
    }
    return items;
  }, [canAccessNicknameSummary, isSuperuser]);

  const activeSidebarItem = useMemo(
    () => sidebarItems.find((item) => item.key === subPage) || sidebarItems[0],
    [sidebarItems, subPage],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (subPage === "manage-nicknames" && !isSuperuser) {
      setSubPage("save");
      return;
    }
    if (subPage === "nickname-summary" && !canAccessNicknameSummary) {
      setSubPage("save");
      return;
    }

    const targetPath = getPathForSubPage(subPage);
    if (window.location.pathname.toLowerCase() !== targetPath.toLowerCase()) {
      window.history.replaceState({}, "", targetPath);
    }
  }, [canAccessNicknameSummary, isSuperuser, subPage]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [subPage]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onPopState = () => {
      setSubPage(getSubPageFromPath(window.location.pathname || "/collection/save"));
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleSelectSubPage = useCallback((nextSubPage: CollectionSubPage) => {
    startTransition(() => {
      setSubPage(nextSubPage);
    });
    setMobileSidebarOpen(false);
  }, []);

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
