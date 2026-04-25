import { useCallback, useEffect, useState } from "react";
import { useAppShellNavigation } from "@/app/useAppShellNavigation";
import { useAppShellAuthActions } from "@/app/useAppShellAuthActions";
import { useAppShellAuthEvents } from "@/app/useAppShellAuthEvents";
import { useAppShellMaintenanceState } from "@/app/useAppShellMaintenanceState";
import { useAppShellMonitorAccess } from "@/app/useAppShellMonitorAccess";
import { useAppShellPageSync } from "@/app/useAppShellPageSync";
import { useAppShellRuntimeState } from "@/app/useAppShellRuntimeState";
import { useAppShellSavedCount } from "@/app/useAppShellSavedCount";
import { useAppShellSessionValidation } from "@/app/useAppShellSessionValidation";
import { useAppShellTabVisibility } from "@/app/useAppShellTabVisibility";
import type { MonitorSection, User } from "@/app/types";
import { performAppLogout, performClientLogout } from "@/app/logout-flow";
import { activityLogout } from "@/lib/api";
import { getStoredActivityId } from "@/lib/auth-session";
import { logClientWarning } from "@/lib/client-logger";

type UseAuthenticatedAppStateArgs = {
  initialMonitorSection: MonitorSection;
  initialPage: string;
  initialUser: User;
};

export function useAuthenticatedAppState({
  initialMonitorSection,
  initialPage,
  initialUser,
}: UseAuthenticatedAppStateArgs) {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [monitorSection, setMonitorSection] = useState<MonitorSection>(initialMonitorSection);
  const [selectedImportId, setSelectedImportId] = useState<string | undefined>();
  const [savedCount, setSavedCount] = useState(0);
  const [user, setUser] = useState<User | null>(initialUser);

  const {
    applyLoggedOutClientState,
    broadcastLogoutToOtherTabs,
  } = useAppShellAuthActions({
    setCurrentPage,
    setMonitorSection,
    setSavedCount,
    setSelectedImportId,
    setUser,
  });

  useAppShellAuthEvents({
    applyLoggedOutClientState,
    setCurrentPage,
    setUser,
  });

  useAppShellSessionValidation({
    applyLoggedOutClientState,
    setCurrentPage,
    setUser,
    user,
  });

  const { runtimeConfig, systemName } = useAppShellRuntimeState({ user });
  const {
    featureLockdown,
    monitorVisibility,
    tabVisibility,
    tabVisibilityLoaded,
  } = useAppShellTabVisibility({ user });

  useAppShellSavedCount({
    currentPage,
    setSavedCount,
    user,
  });

  useAppShellPageSync({
    currentPage,
    setCurrentPage,
    tabVisibility,
    tabVisibilityLoaded,
    user,
  });

  useAppShellMaintenanceState({
    currentPage,
    setCurrentPage,
    user,
  });

  useAppShellMonitorAccess({
    currentPage,
    featureLockdown,
    monitorSection,
    monitorVisibility,
    setCurrentPage,
    setMonitorSection,
    tabVisibility,
    tabVisibilityLoaded,
    user,
  });

  const { handleMonitorSectionChange, handleNavigate } = useAppShellNavigation({
    featureLockdown,
    monitorVisibilityMonitor: monitorVisibility.monitor,
    setCurrentPage,
    setMonitorSection,
    setSelectedImportId,
    tabVisibility,
    tabVisibilityLoaded,
    user,
  });

  const handleLogout = useCallback(async () => {
    await performAppLogout({
      activityId: getStoredActivityId() || undefined,
      activityLogout,
      applyLoggedOutClientState,
      broadcastLogoutToOtherTabs,
      warn: (message, error) => {
        logClientWarning(message, error);
      },
    });
  }, [applyLoggedOutClientState, broadcastLogoutToOtherTabs]);

  const handleClientLogout = useCallback(() => {
    performClientLogout({
      applyLoggedOutClientState,
      broadcastLogoutToOtherTabs,
    });
  }, [applyLoggedOutClientState, broadcastLogoutToOtherTabs]);

  useEffect(() => {
    if (user) {
      return;
    }

    setCurrentPage("home");
    setMonitorSection("monitor");
    setSelectedImportId(undefined);
    setSavedCount(0);
  }, [user]);

  return {
    currentPage,
    featureLockdown,
    handleClientLogout,
    handleLogout,
    handleMonitorSectionChange,
    handleNavigate,
    monitorSection,
    monitorVisibility,
    runtimeConfig,
    savedCount,
    selectedImportId,
    systemName,
    tabVisibility,
    tabVisibilityLoaded,
    user,
  };
}
