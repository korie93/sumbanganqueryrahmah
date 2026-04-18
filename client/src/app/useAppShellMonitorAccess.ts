import { useEffect, type Dispatch, type SetStateAction } from "react";
import {
  getDefaultMonitorSection,
  getDefaultPageForRole,
  isPageEnabled,
} from "@/app/monitorAccess";
import { replaceHistory } from "@/app/routing";
import type { MonitorSection, PageName, TabVisibility, User } from "@/app/types";

type MonitorVisibility = {
  activity: boolean;
  analysis: boolean;
  audit: boolean;
  dashboard: boolean;
  monitor: boolean;
};

type UseAppShellMonitorAccessArgs = {
  currentPage: PageName;
  featureLockdown: boolean;
  monitorSection: MonitorSection;
  monitorVisibility: MonitorVisibility;
  setCurrentPage: Dispatch<SetStateAction<PageName>>;
  setMonitorSection: Dispatch<SetStateAction<MonitorSection>>;
  tabVisibility: TabVisibility;
  tabVisibilityLoaded: boolean;
  user: User | null;
};

export function useAppShellMonitorAccess({
  currentPage,
  featureLockdown,
  monitorSection,
  monitorVisibility,
  setCurrentPage,
  setMonitorSection,
  tabVisibility,
  tabVisibilityLoaded,
  user,
}: UseAppShellMonitorAccessArgs) {
  useEffect(() => {
    if (!user || currentPage !== "monitor") return;
    if (featureLockdown) return;
    if (isPageEnabled(user.role, "monitor", tabVisibility, tabVisibilityLoaded)) return;

    setCurrentPage("forbidden");
    replaceHistory("/403");
  }, [currentPage, featureLockdown, setCurrentPage, tabVisibility, tabVisibilityLoaded, user]);

  useEffect(() => {
    if (!user || currentPage !== "monitor") return;

    const hasExplicitMonitorSectionQuery = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).has("section")
      : false;

    if (monitorSection === "monitor" && !monitorVisibility.monitor) {
      if (hasExplicitMonitorSectionQuery) {
        setCurrentPage("forbidden");
        replaceHistory("/403");
        return;
      }

      setMonitorSection(getDefaultMonitorSection(user.role, tabVisibility, tabVisibilityLoaded));
      return;
    }

    const requestedAllowed =
      (monitorSection === "monitor" && monitorVisibility.monitor)
      || (monitorSection === "dashboard" && monitorVisibility.dashboard)
      || (monitorSection === "activity" && monitorVisibility.activity)
      || (monitorSection === "analysis" && monitorVisibility.analysis)
      || (monitorSection === "audit" && monitorVisibility.audit);

    if (!requestedAllowed) {
      setMonitorSection(getDefaultMonitorSection(user.role, tabVisibility, tabVisibilityLoaded));
    }
  }, [
    currentPage,
    monitorSection,
    monitorVisibility,
    setCurrentPage,
    setMonitorSection,
    tabVisibility,
    tabVisibilityLoaded,
    user,
  ]);

  useEffect(() => {
    if (!user) return;
    if (isPageEnabled(user.role, currentPage, tabVisibility, tabVisibilityLoaded)) return;

    if (featureLockdown) {
      setCurrentPage("general-search");
      replaceHistory("/");
      return;
    }

    if (currentPage === "monitor") {
      setCurrentPage("forbidden");
      replaceHistory("/403");
      return;
    }

    setCurrentPage(getDefaultPageForRole(user.role, tabVisibility, tabVisibilityLoaded));
  }, [currentPage, featureLockdown, setCurrentPage, tabVisibility, tabVisibilityLoaded, user]);
}
