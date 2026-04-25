import { useCallback, useState } from "react";
import { useAppShellNavigation } from "@/app/useAppShellNavigation";
import { useAppShellAuthState } from "@/app/useAppShellAuthState";
import { useAppShellMaintenanceState } from "@/app/useAppShellMaintenanceState";
import { useAppShellMonitorAccess } from "@/app/useAppShellMonitorAccess";
import { useAppShellPageSync } from "@/app/useAppShellPageSync";
import type { MonitorSection } from "@/app/types";
import { useAppShellRuntimeState } from "@/app/useAppShellRuntimeState";
import { useAppShellSavedCount } from "@/app/useAppShellSavedCount";
import { useAppShellTabVisibility } from "@/app/useAppShellTabVisibility";
import { performAppLogout, performClientLogout } from "@/app/logout-flow";
import { activityLogout } from "@/lib/api";
import { getStoredActivityId } from "@/lib/auth-session";
import { logClientWarning } from "@/lib/client-logger";

export function useAppShellState() {
  const [currentPage, setCurrentPage] = useState("home");
  const [monitorSection, setMonitorSection] = useState<MonitorSection>("monitor");
  const [selectedImportId, setSelectedImportId] = useState<string | undefined>();
  const [savedCount, setSavedCount] = useState(0);

  const {
    applyLoggedOutClientState,
    broadcastLogoutToOtherTabs,
    handleLoginSuccess,
    isInitialized,
    user,
  } = useAppShellAuthState({
    setCurrentPage,
    setMonitorSection,
    setSavedCount,
    setSelectedImportId,
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

  return {
    currentPage,
    featureLockdown,
    handleClientLogout,
    handleLoginSuccess,
    handleLogout,
    handleMonitorSectionChange,
    handleNavigate,
    isInitialized,
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
