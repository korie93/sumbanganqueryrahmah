import {
  useCallback,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  LOCAL_STORAGE_KEYS_TO_CLEAR,
  SESSION_STORAGE_KEYS_TO_CLEAR,
} from "@/app/constants";
import {
  broadcastForcedLogoutToOtherTabs,
  clearAuthenticatedUserStorage,
} from "@/lib/auth-session";
import {
  isPublicAuthRoutePage,
  replaceHistory,
  resolveRouteFromLocation,
  type ResolvedRoute,
} from "@/app/routing";
import type { MonitorSection, User } from "@/app/types";
import { clearAppQueryCache } from "@/lib/query-client-runtime";

type UseAppShellAuthActionsArgs = {
  setCurrentPage: Dispatch<SetStateAction<string>>;
  setMonitorSection: Dispatch<SetStateAction<MonitorSection>>;
  setSavedCount: Dispatch<SetStateAction<number>>;
  setSelectedImportId: Dispatch<SetStateAction<string | undefined>>;
  setUser: Dispatch<SetStateAction<User | null>>;
};

export function useAppShellAuthActions({
  setCurrentPage,
  setMonitorSection,
  setSavedCount,
  setSelectedImportId,
  setUser,
}: UseAppShellAuthActionsArgs) {
  const broadcastLogoutToOtherTabs = useCallback(() => {
    broadcastForcedLogoutToOtherTabs();
  }, []);

  const clearClientSessionStorage = useCallback(() => {
    clearAuthenticatedUserStorage();
    for (const key of LOCAL_STORAGE_KEYS_TO_CLEAR) {
      localStorage.removeItem(key);
    }
    for (const key of SESSION_STORAGE_KEYS_TO_CLEAR) {
      sessionStorage.removeItem(key);
    }
    clearAppQueryCache();
  }, []);

  const applyLoggedOutClientState = useCallback((redirectToLogin = true, broadcast = false) => {
    if (broadcast) {
      broadcastForcedLogoutToOtherTabs();
    }
    clearClientSessionStorage();
    setUser(null);
    setCurrentPage("home");
    setMonitorSection("monitor");
    setSelectedImportId(undefined);
    setSavedCount(0);
    if (redirectToLogin) {
      replaceHistory("/");
    }
  }, [
    clearClientSessionStorage,
    setCurrentPage,
    setMonitorSection,
    setSavedCount,
    setSelectedImportId,
    setUser,
  ]);

  const applyResolvedRoute = useCallback((route: ResolvedRoute | null) => {
    if (!route) return false;

    setCurrentPage(route.page);
    if (route.monitorSection) {
      setMonitorSection(route.monitorSection);
    }
    if (route.normalizedPath) {
      replaceHistory(route.normalizedPath);
    }

    return true;
  }, [setCurrentPage, setMonitorSection]);

  const handleLoginSuccess = useCallback((loggedInUser: User) => {
    setUser(loggedInUser);
    if (loggedInUser.mustChangePassword) {
      setCurrentPage("change-password");
      replaceHistory("/change-password");
      return;
    }

    if (typeof window !== "undefined") {
      const resolvedRoute = resolveRouteFromLocation(
        window.location.pathname,
        window.location.search,
      );
      if (resolvedRoute && !isPublicAuthRoutePage(resolvedRoute.page) && applyResolvedRoute(resolvedRoute)) {
        const persistedPage = resolvedRoute.page === "monitor"
          ? "monitor"
          : resolvedRoute.page;
        localStorage.setItem("activeTab", persistedPage);
        localStorage.setItem("lastPage", persistedPage);
        return;
      }
    }

    setCurrentPage(loggedInUser.role === "user" ? "general-search" : "home");
  }, [applyResolvedRoute, setCurrentPage, setUser]);

  return {
    applyLoggedOutClientState,
    applyResolvedRoute,
    broadcastLogoutToOtherTabs,
    clearClientSessionStorage,
    handleLoginSuccess,
  };
}
