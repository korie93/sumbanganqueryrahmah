import { useCallback, type Dispatch, type SetStateAction } from "react";
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
  const handleNavigate = useCallback((page: string, importId?: string) => {
    const monitorSectionTarget = parseMonitorSectionFromPageInput(page);
    const requestedPage = monitorSectionTarget ? "monitor" : page;

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
    localStorage.setItem("activeTab", requestedPage);
    localStorage.setItem("lastPage", requestedPage);
    replaceHistory(buildPathForPage(requestedPage));

    if (importId) {
      setSelectedImportId(importId);
    }
  }, [
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
