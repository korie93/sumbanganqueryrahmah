import { useCallback, type Dispatch, type SetStateAction } from "react";
import { ACTIVE_SETTINGS_SECTION_KEY } from "@/app/constants";
import {
  getBrowserLocalStorage,
  safeRemoveStorageItem,
  safeSetStorageItem,
} from "@/lib/browser-storage";
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
    const storage = getBrowserLocalStorage();
    safeRemoveStorageItem(storage, "selectedImportId");
    safeRemoveStorageItem(storage, "selectedImportName");
  }, [setSelectedImportId]);

  const handleNavigate = useCallback((page: string, importId?: string) => {
    const storage = getBrowserLocalStorage();
    if (page === "backup") {
      if (!isPageEnabled(user?.role, "backup", tabVisibility, tabVisibilityLoaded)) {
        setCurrentPage(getDefaultPageForRole(user?.role || "user", tabVisibility, tabVisibilityLoaded));
        return;
      }
      safeSetStorageItem(storage, ACTIVE_SETTINGS_SECTION_KEY, "backup-restore");
      setCurrentPage("settings");
      safeSetStorageItem(storage, "activeTab", "settings");
      safeSetStorageItem(storage, "lastPage", "settings");
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
      safeSetStorageItem(storage, "activeTab", "change-password");
      safeSetStorageItem(storage, "lastPage", "change-password");
      replaceHistory("/change-password");
      return;
    }

    if (featureLockdown && requestedPage !== "general-search") {
      setCurrentPage("general-search");
      safeSetStorageItem(storage, "activeTab", "general-search");
      safeSetStorageItem(storage, "lastPage", "general-search");
      replaceHistory("/");
      return;
    }

    if (!isPageEnabled(user?.role, requestedPage, tabVisibility, tabVisibilityLoaded)) {
      if (requestedPage === "monitor") {
        setCurrentPage("forbidden");
        safeSetStorageItem(storage, "activeTab", "forbidden");
        safeSetStorageItem(storage, "lastPage", "forbidden");
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
      safeSetStorageItem(storage, "activeTab", "monitor");
      safeSetStorageItem(storage, "lastPage", "monitor");
      replaceHistory(buildPathForPage("monitor", nextSection));
      return;
    }

    setCurrentPage(requestedPage);
    if (requestedPage === "settings") {
      safeRemoveStorageItem(storage, ACTIVE_SETTINGS_SECTION_KEY);
    }
    safeSetStorageItem(storage, "activeTab", requestedPage);
    safeSetStorageItem(storage, "lastPage", requestedPage);
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
