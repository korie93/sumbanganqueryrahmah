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
  isReadOnlyManager: boolean;
  isSuperuser: boolean;
};

export function useCollectionReportNavigation({
  canAccessNicknameSummary,
  isReadOnlyManager,
  isSuperuser,
}: UseCollectionReportNavigationArgs) {
  const [subPage, setSubPage] = useState<CollectionSubPage>(() => {
    if (typeof window === "undefined") return isReadOnlyManager ? "records" : "save";
    const resolved = getSubPageFromPath(window.location.pathname || "/collection/save");
    return isReadOnlyManager && resolved === "save" ? "records" : resolved;
  });
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
      {
        key: "billing-principal",
        label: "Billing Principal (OSP)",
        icon: CircleDollarSign,
        description: "Ukur OSP yang ditutup oleh peristiwa Abort CP sahaja.",
      },
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
  }, [canAccessNicknameSummary, isReadOnlyManager, isSuperuser]);

  const activeSidebarItem = useMemo(
    () => sidebarItems.find((item) => item.key === subPage) || sidebarItems[0],
    [sidebarItems, subPage],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (subPage === "save" && isReadOnlyManager) {
      setSubPage("records");
      return;
    }
    if (subPage === "manage-nicknames" && !isSuperuser) {
      setSubPage(isReadOnlyManager ? "records" : "save");
      return;
    }
    if (subPage === "nickname-summary" && !canAccessNicknameSummary) {
      setSubPage(isReadOnlyManager ? "records" : "save");
      return;
    }

    const targetPath = getPathForSubPage(subPage);
    if (window.location.pathname.toLowerCase() !== targetPath.toLowerCase()) {
      window.history.replaceState({}, "", targetPath);
    }
  }, [canAccessNicknameSummary, isReadOnlyManager, isSuperuser, subPage]);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [subPage]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onPopState = () => {
      const resolved = getSubPageFromPath(window.location.pathname || "/collection/save");
      setSubPage(isReadOnlyManager && resolved === "save" ? "records" : resolved);
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isReadOnlyManager]);

  const handleSelectSubPage = useCallback((nextSubPage: CollectionSubPage) => {
    if (isReadOnlyManager && nextSubPage === "save") {
      return;
    }
    startTransition(() => {
      setSubPage(nextSubPage);
    });
    setMobileSidebarOpen(false);
  }, [isReadOnlyManager]);

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
