import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SYSTEM_NAME } from "@/app/constants";
import {
  buildPathForPage,
  isPublicAuthRoutePage,
  parseMonitorSectionFromPageInput,
  replaceHistory,
  resolveRouteFromLocation,
  type ResolvedRoute,
} from "@/app/routing";
import type { MonitorSection, User } from "@/app/types";
import {
  clearAuthenticatedUserStorage,
  getStoredAuthenticatedUser,
  getStoredForcePasswordChange,
  hasAuthSessionHintCookie,
  isBannedSessionFlagSet,
  persistAuthenticatedUser,
} from "@/lib/auth-session";

type PublicBootstrapState = {
  currentPage: string;
  monitorSection: MonitorSection;
  isInitialized: boolean;
  resolvedRoute: ResolvedRoute | null;
  shouldRestoreSession: boolean;
};

function resolvePublicBootstrapState(): PublicBootstrapState {
  if (typeof window === "undefined") {
    return {
      currentPage: "home",
      monitorSection: "monitor",
      isInitialized: true,
      resolvedRoute: null,
      shouldRestoreSession: false,
    };
  }

  const resolvedRoute = resolveRouteFromLocation(window.location.pathname, window.location.search);
  const savedUser = getStoredAuthenticatedUser();
  const hasAuthHintCookie = hasAuthSessionHintCookie();
  const isAnonymousChangePasswordRoute =
    resolvedRoute?.page === "change-password" && !savedUser && !hasAuthHintCookie;
  const shouldRestoreSession =
    !isBannedSessionFlagSet() && !isAnonymousChangePasswordRoute && (Boolean(savedUser) || hasAuthHintCookie);

  return {
    currentPage: isAnonymousChangePasswordRoute ? "home" : (resolvedRoute?.page || "home"),
    monitorSection: resolvedRoute?.monitorSection || "monitor",
    isInitialized: !shouldRestoreSession,
    resolvedRoute: isAnonymousChangePasswordRoute ? { page: "home" } : resolvedRoute,
    shouldRestoreSession,
  };
}

function resolveAuthenticatedEntryPage(route: ResolvedRoute | null, user: User) {
  const savedPage = localStorage.getItem("activeTab") || localStorage.getItem("lastPage");

  if (route && !isPublicAuthRoutePage(route.page)) {
    return {
      currentPage: route.page,
      monitorSection: route.monitorSection || "monitor",
    };
  }

  if (user.mustChangePassword) {
    return {
      currentPage: "change-password",
      monitorSection: "monitor" as MonitorSection,
    };
  }

  if (savedPage === "backup") {
    localStorage.setItem("activeTab", "settings");
    localStorage.setItem("lastPage", "settings");
    replaceHistory("/settings?section=backup-restore");
    return {
      currentPage: "settings",
      monitorSection: "monitor" as MonitorSection,
    };
  }

  if (user.role === "user") {
    const nextPage = savedPage === "settings" ? "settings" : "general-search";
    return {
      currentPage: nextPage,
      monitorSection: "monitor" as MonitorSection,
    };
  }

  if (savedPage) {
    const savedMonitorSection = parseMonitorSectionFromPageInput(savedPage);
    if (savedMonitorSection) {
      return {
        currentPage: "monitor",
        monitorSection: savedMonitorSection,
      };
    }

    return {
      currentPage: savedPage,
      monitorSection: "monitor" as MonitorSection,
    };
  }

  return {
    currentPage: "home",
    monitorSection: "monitor" as MonitorSection,
  };
}

export function usePublicAppState() {
  const bootstrapRef = useRef<PublicBootstrapState | null>(null);
  if (!bootstrapRef.current) {
    bootstrapRef.current = resolvePublicBootstrapState();
  }

  const bootstrap = bootstrapRef.current;
  const [currentPage, setCurrentPage] = useState(bootstrap.currentPage);
  const [monitorSection, setMonitorSection] = useState<MonitorSection>(bootstrap.monitorSection);
  const [user, setUser] = useState<User | null>(null);
  const [isInitialized, setIsInitialized] = useState(bootstrap.isInitialized);

  const handlePublicNavigate = useCallback((page: string) => {
    const nextPage = page.trim() || "home";
    setCurrentPage(nextPage);
    replaceHistory(buildPathForPage(nextPage));
  }, []);

  const handleAuthenticatedLogout = useCallback(() => {
    setUser(null);
    setCurrentPage("home");
    setMonitorSection("monitor");
    replaceHistory("/");
  }, []);

  const handleLoginSuccess = useCallback((loggedInUser: User) => {
    const route = typeof window !== "undefined"
      ? resolveRouteFromLocation(window.location.pathname, window.location.search)
      : null;
    const nextState = resolveAuthenticatedEntryPage(route, loggedInUser);

    setUser(loggedInUser);
    setCurrentPage(nextState.currentPage);
    setMonitorSection(nextState.monitorSection);

    const persistedPage = nextState.currentPage === "monitor"
      ? "monitor"
      : nextState.currentPage;
    localStorage.setItem("activeTab", persistedPage);
    localStorage.setItem("lastPage", persistedPage);

    if (nextState.currentPage === "change-password") {
      replaceHistory("/change-password");
      return;
    }

    if (route && !isPublicAuthRoutePage(route.page)) {
      if (route.normalizedPath) {
        replaceHistory(route.normalizedPath);
      }
      return;
    }

    replaceHistory(
      buildPathForPage(
        nextState.currentPage,
        nextState.currentPage === "monitor" ? nextState.monitorSection : "monitor",
      ),
    );
  }, []);

  useEffect(() => {
    if (!bootstrap.shouldRestoreSession) {
      return;
    }

    let cancelled = false;
    const savedUser = getStoredAuthenticatedUser();
    const forcePasswordChange = getStoredForcePasswordChange();
    const hasAuthHintCookie = hasAuthSessionHintCookie();

    if (savedUser && !hasAuthHintCookie) {
      clearAuthenticatedUserStorage();
      setIsInitialized(true);
      return () => {
        cancelled = true;
      };
    }

    const restoreAuthenticatedSession = async () => {
      try {
        const { getMe } = await import("@/lib/api/auth");
        const me = await getMe();
        if (cancelled) {
          return;
        }

        const username = String(me?.username || "").trim();
        const role = String(me?.role || "").trim();
        if (!username || !role) {
          throw new Error("Invalid session");
        }

        const nextUser: User = {
          id: me.id,
          username,
          fullName: me.fullName ?? null,
          email: me.email ?? null,
          role,
          status: me.status,
          mustChangePassword: forcePasswordChange || Boolean(me.mustChangePassword),
          passwordResetBySuperuser: Boolean(me.passwordResetBySuperuser),
          isBanned: me.isBanned ?? null,
        };

        persistAuthenticatedUser(nextUser);
        const nextState = resolveAuthenticatedEntryPage(bootstrap.resolvedRoute, nextUser);
        setUser(nextUser);
        setCurrentPage(nextState.currentPage);
        setMonitorSection(nextState.monitorSection);
      } catch {
        if (!cancelled) {
          clearAuthenticatedUserStorage();
        }
      } finally {
        if (!cancelled) {
          setIsInitialized(true);
        }
      }
    };

    void restoreAuthenticatedSession();

    return () => {
      cancelled = true;
    };
  }, [bootstrap.resolvedRoute, bootstrap.shouldRestoreSession]);

  useEffect(() => {
    if (typeof window === "undefined" || user) {
      return;
    }

    const pathname = window.location.pathname.toLowerCase();
    if (pathname === "/change-password" && !getStoredAuthenticatedUser() && !hasAuthSessionHintCookie()) {
      replaceHistory("/");
      setCurrentPage("home");
    }
  }, [user]);

  return {
    currentPage,
    handleAuthenticatedLogout,
    handleLoginSuccess,
    handlePublicNavigate,
    isInitialized,
    monitorSection,
    systemName: DEFAULT_SYSTEM_NAME,
    user,
  };
}
