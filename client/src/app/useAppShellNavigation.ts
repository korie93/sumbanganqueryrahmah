import { useCallback, type Dispatch, type SetStateAction } from "react";
import { ACTIVE_SETTINGS_SECTION_KEY } from "@/app/constants";
import {
  getDefaultMonitorSection,
  getDefaultPageForRole,
  isPageEnabled,
} from "@/app/monitorAccess";
import {
  buildPathForPage,
  parseMonitorSectionFromPageInput,
  replaceHistory,
} from "@/app/routing";
import type { MonitorSection, TabVisibility, User } from "@/app/types";

type UseAppShellNavigationArgs = {
  featureLockdown: boolean;
  monitorVisibilityMonitor: boolean;
  setCurrentPage: Dispatch<SetStateAction<string>>;
  setMonitorSection: Dispatch<SetStateAction<MonitorSection>>;
  setSelectedImportId: Dispatch<SetStateAction<string | undefined>>;
  tabVisibility: TabVisibility;
  tabVisibilityLoaded: boolean;
  user: User | null;
};

export function useAppShellNavigation({
  featureLockdown,
  monitorVisibilityMonitor,
  setCurrentPage,
  setMonitorSection,
  setSelectedImportId,
  tabVisibility,
  tabVisibilityLoaded,
  user,
}: UseAppShellNavigationArgs) {
  const clearViewerSelection = useCallback(() => {
    setSelectedImportId(undefined);
    localStorage.removeItem("selectedImportId");
    localStorage.removeItem("selectedImportName");
  }, [setSelectedImportId]);

  const handleNavigate = useCallback((page: string, importId?: string) => {
    if (page === "backup") {
      if (!isPageEnabled(user?.role, "backup", tabVisibility, tabVisibilityLoaded)) {
        setCurrentPage(getDefaultPageForRole(user?.role || "user", tabVisibility, tabVisibilityLoaded));
        return;
      }
      localStorage.setItem(ACTIVE_SETTINGS_SECTION_KEY, "backup-restore");
      setCurrentPage("settings");
      localStorage.setItem("activeTab", "settings");
      localStorage.setItem("lastPage", "settings");
      replaceHistory("/settings?section=backup-restore");
      return;
    }

    const monitorSectionTarget = parseMonitorSectionFromPageInput(page);
    const requestedPage = monitorSectionTarget ? "monitor" : page;
    const preserveViewerSelection = requestedPage === "viewer" && Boolean(importId);

    if (!preserveViewerSelection) {
      clearViewerSelection();
    }

    if (user?.mustChangePassword && requestedPage !== "change-password") {
      setCurrentPage("change-password");
      localStorage.setItem("activeTab", "change-password");
      localStorage.setItem("lastPage", "change-password");
      replaceHistory("/change-password");
      return;
    }

    if (featureLockdown && requestedPage !== "general-search") {
      setCurrentPage("general-search");
      localStorage.setItem("activeTab", "general-search");
      localStorage.setItem("lastPage", "general-search");
      replaceHistory("/");
      return;
    }

    if (!isPageEnabled(user?.role, requestedPage, tabVisibility, tabVisibilityLoaded)) {
      if (requestedPage === "monitor") {
        setCurrentPage("forbidden");
        localStorage.setItem("activeTab", "forbidden");
        localStorage.setItem("lastPage", "forbidden");
        replaceHistory("/403");
        return;
      }

      setCurrentPage(getDefaultPageForRole(user?.role || "user", tabVisibility, tabVisibilityLoaded));
      return;
    }

    if (monitorSectionTarget) {
      let nextSection = monitorSectionTarget;
      if (nextSection === "monitor" && !monitorVisibilityMonitor) {
        nextSection = getDefaultMonitorSection(user?.role, tabVisibility, tabVisibilityLoaded);
      }

      setCurrentPage("monitor");
      setMonitorSection(nextSection);
      localStorage.setItem("activeTab", "monitor");
      localStorage.setItem("lastPage", "monitor");
      replaceHistory(buildPathForPage("monitor", nextSection));
      return;
    }

    setCurrentPage(requestedPage);
    if (requestedPage === "settings") {
      localStorage.removeItem(ACTIVE_SETTINGS_SECTION_KEY);
    }
    localStorage.setItem("activeTab", requestedPage);
    localStorage.setItem("lastPage", requestedPage);
    replaceHistory(buildPathForPage(requestedPage));

    if (importId) {
      setSelectedImportId(importId);
    }
  }, [
    clearViewerSelection,
    featureLockdown,
    monitorVisibilityMonitor,
    setCurrentPage,
    setMonitorSection,
    setSelectedImportId,
    tabVisibility,
    tabVisibilityLoaded,
    user?.mustChangePassword,
    user?.role,
  ]);

  const handleMonitorSectionChange = useCallback((section: MonitorSection) => {
    setMonitorSection((previous) => (previous === section ? previous : section));
    replaceHistory(buildPathForPage("monitor", section));
  }, [setMonitorSection]);

  return {
    handleMonitorSectionChange,
    handleNavigate,
  };
}
