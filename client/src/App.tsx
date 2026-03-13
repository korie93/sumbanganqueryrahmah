import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AppPageRenderer } from "@/app/AppPageRenderer";
import { AppProviders } from "@/app/AppProviders";
import { DEFAULT_RUNTIME_CONFIG, DEFAULT_SYSTEM_NAME, LOCAL_STORAGE_KEYS_TO_CLEAR, SESSION_STORAGE_KEYS_TO_CLEAR } from "@/app/constants";
import { BannedPage, LoginPage, MaintenanceRoutePage } from "@/app/lazy-pages";
import {
  getDefaultMonitorSection,
  getDefaultPageForRole,
  getMonitorSectionVisibility,
  isPageEnabled,
  isSuperuserFeatureOffMode,
} from "@/app/monitorAccess";
import { PageSpinner } from "@/app/PageSpinner";
import { buildPathForPage, parseMonitorSectionFromPageInput, replaceHistory, resolveRouteFromLocation, type ResolvedRoute } from "@/app/routing";
import type { AppRuntimeConfig, MonitorSection, TabVisibility, User } from "@/app/types";
import AutoLogout from "@/components/AutoLogout";
import FloatingAI from "@/components/FloatingAI";
import Navbar from "@/components/Navbar";
import { activityLogout, getAppConfig, getImports, getMaintenanceStatus, getMe, getTabVisibility } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState("home");
  const [monitorSection, setMonitorSection] = useState<MonitorSection>("monitor");
  const [selectedImportId, setSelectedImportId] = useState<string | undefined>();
  const [isInitialized, setIsInitialized] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [systemName, setSystemName] = useState(DEFAULT_SYSTEM_NAME);
  const [tabVisibility, setTabVisibility] = useState<TabVisibility>(null);
  const [tabVisibilityLoaded, setTabVisibilityLoaded] = useState(false);
  const [runtimeConfig, setRuntimeConfig] = useState<AppRuntimeConfig>(DEFAULT_RUNTIME_CONFIG);

  const clearClientSessionStorage = useCallback(() => {
    for (const key of LOCAL_STORAGE_KEYS_TO_CLEAR) {
      localStorage.removeItem(key);
    }
    for (const key of SESSION_STORAGE_KEYS_TO_CLEAR) {
      sessionStorage.removeItem(key);
    }
    queryClient.clear();
  }, []);

  const applyLoggedOutClientState = useCallback((redirectToLogin = true) => {
    clearClientSessionStorage();
    setUser(null);
    setCurrentPage("home");
    setMonitorSection("monitor");
    setSelectedImportId(undefined);
    setSavedCount(0);
    setTabVisibility(null);
    setTabVisibilityLoaded(false);
    if (redirectToLogin) {
      replaceHistory("/");
    }
  }, [clearClientSessionStorage]);

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
  }, []);

  const fetchSavedCount = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const data = await getImports();
      setSavedCount(data.imports?.length || 0);
    } catch {
      setSavedCount(0);
    }
  }, []);

  const featureLockdown = useMemo(
    () => isSuperuserFeatureOffMode(user?.role, tabVisibility, tabVisibilityLoaded),
    [tabVisibility, tabVisibilityLoaded, user?.role],
  );

  const monitorVisibility = useMemo(
    () => getMonitorSectionVisibility(user?.role, tabVisibility, tabVisibilityLoaded),
    [tabVisibility, tabVisibilityLoaded, user?.role],
  );

  useEffect(() => {
    const pathname = typeof window !== "undefined" ? window.location.pathname : "/";
    const search = typeof window !== "undefined" ? window.location.search : "";
    const resolvedRoute = resolveRouteFromLocation(pathname, search);

    applyResolvedRoute(resolvedRoute);

    const banned = localStorage.getItem("banned");
    if (banned === "1") {
      setIsInitialized(true);
      return;
    }

    const token = localStorage.getItem("token");
    const savedUser = localStorage.getItem("user");
    const savedPage = localStorage.getItem("activeTab") || localStorage.getItem("lastPage");

    if (token && savedUser) {
      try {
        const parsedUser = JSON.parse(savedUser) as User;
        setUser(parsedUser);

        if (!applyResolvedRoute(resolvedRoute)) {
          if (parsedUser.role === "user") {
            setCurrentPage(savedPage === "settings" ? "settings" : "general-search");
          } else if (savedPage) {
            const savedMonitorSection = parseMonitorSectionFromPageInput(savedPage);
            if (savedMonitorSection) {
              setCurrentPage("monitor");
              setMonitorSection(savedMonitorSection);
            } else {
              setCurrentPage(savedPage);
            }
          }
        }
      } catch {
        clearClientSessionStorage();
      }
    }

    setIsInitialized(true);
  }, [applyResolvedRoute, clearClientSessionStorage]);

  useEffect(() => {
    if (user && user.role !== "user") {
      void fetchSavedCount();
      return;
    }
    setSavedCount(0);
  }, [fetchSavedCount, user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    const validateSession = async () => {
      try {
        const me = await getMe();
        if (cancelled) return;

        const username = String(me?.username || "").trim();
        const role = String(me?.role || "").trim();
        if (!username || !role) {
          throw new Error("Invalid session");
        }

        localStorage.setItem("username", username);
        localStorage.setItem("role", role);
        localStorage.setItem("user", JSON.stringify({ username, role }));
      } catch {
        if (!cancelled) {
          applyLoggedOutClientState(true);
        }
      }
    };

    void validateSession();
    return () => {
      cancelled = true;
    };
  }, [applyLoggedOutClientState, user?.role, user?.username]);

  useEffect(() => {
    if (typeof window === "undefined" || user) return;
    const pathname = window.location.pathname.toLowerCase();
    if (pathname === "/collection-report" || pathname.startsWith("/collection/")) {
      replaceHistory("/");
      setCurrentPage("home");
    }
  }, [user]);

  useEffect(() => {
    const onProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ username?: string; role?: string }>).detail;
      if (!detail?.username || !detail?.role) return;
      const username = detail.username;
      const role = detail.role;

      setUser((previous) => {
        if (!previous) {
          return { username, role };
        }
        return { ...previous, username, role };
      });
    };

    window.addEventListener("profile-updated", onProfileUpdated as EventListener);
    return () => window.removeEventListener("profile-updated", onProfileUpdated as EventListener);
  }, []);

  useEffect(() => {
    if (!user) {
      setSystemName(DEFAULT_SYSTEM_NAME);
      setRuntimeConfig(DEFAULT_RUNTIME_CONFIG);
      return;
    }

    let cancelled = false;

    const loadAppRuntimeConfig = async () => {
      try {
        const response = await getAppConfig();
        const name = String(response?.systemName || "").trim();
        const sessionTimeoutMinutes = Number(response?.sessionTimeoutMinutes);
        const heartbeatIntervalMinutes = Number(response?.heartbeatIntervalMinutes);
        const aiTimeoutMs = Number(response?.aiTimeoutMs);
        const searchResultLimit = Number(response?.searchResultLimit);
        const viewerRowsPerPage = Number(response?.viewerRowsPerPage);

        if (!cancelled) {
          setSystemName(name || DEFAULT_SYSTEM_NAME);
          setRuntimeConfig({
            sessionTimeoutMinutes: Number.isFinite(sessionTimeoutMinutes) ? Math.max(1, sessionTimeoutMinutes) : DEFAULT_RUNTIME_CONFIG.sessionTimeoutMinutes,
            heartbeatIntervalMinutes: Number.isFinite(heartbeatIntervalMinutes) ? Math.max(1, heartbeatIntervalMinutes) : DEFAULT_RUNTIME_CONFIG.heartbeatIntervalMinutes,
            aiTimeoutMs: Number.isFinite(aiTimeoutMs) ? Math.max(1000, aiTimeoutMs) : DEFAULT_RUNTIME_CONFIG.aiTimeoutMs,
            aiEnabled: response?.aiEnabled !== false,
            searchResultLimit: Number.isFinite(searchResultLimit) ? Math.min(5000, Math.max(10, Math.floor(searchResultLimit))) : DEFAULT_RUNTIME_CONFIG.searchResultLimit,
            viewerRowsPerPage: Number.isFinite(viewerRowsPerPage) ? Math.min(500, Math.max(10, Math.floor(viewerRowsPerPage))) : DEFAULT_RUNTIME_CONFIG.viewerRowsPerPage,
          });
        }
      } catch {
        if (!cancelled) {
          setSystemName(DEFAULT_SYSTEM_NAME);
          setRuntimeConfig(DEFAULT_RUNTIME_CONFIG);
        }
      }
    };

    void loadAppRuntimeConfig();
    const onSettingsUpdated = () => {
      void loadAppRuntimeConfig();
    };

    window.addEventListener("settings-updated", onSettingsUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("settings-updated", onSettingsUpdated);
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setTabVisibility(null);
      setTabVisibilityLoaded(false);
      return;
    }

    let cancelled = false;

    const loadTabVisibility = async () => {
      if (!cancelled) {
        setTabVisibilityLoaded(false);
      }

      if (user.role === "superuser") {
        if (!cancelled) {
          setTabVisibility(null);
          setTabVisibilityLoaded(true);
        }
        return;
      }

      try {
        const response = await getTabVisibility();
        const tabs = response?.tabs && typeof response.tabs === "object" ? response.tabs : {};
        if (!cancelled) {
          setTabVisibility(tabs);
          setTabVisibilityLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setTabVisibility(null);
          setTabVisibilityLoaded(true);
        }
      }
    };

    void loadTabVisibility();
    const onSettingsUpdated = () => {
      void loadTabVisibility();
    };

    window.addEventListener("settings-updated", onSettingsUpdated);
    return () => {
      cancelled = true;
      window.removeEventListener("settings-updated", onSettingsUpdated);
    };
  }, [user]);

  useEffect(() => {
    const onMaintenanceUpdated = (event: Event) => {
      const custom = event as CustomEvent<{ maintenance?: boolean }>;
      if (custom.detail?.maintenance) {
        setCurrentPage("maintenance");
      } else if (currentPage === "maintenance") {
        setCurrentPage(user?.role === "user" ? "general-search" : "home");
      }
    };

    window.addEventListener("maintenance-updated", onMaintenanceUpdated as EventListener);
    return () => window.removeEventListener("maintenance-updated", onMaintenanceUpdated as EventListener);
  }, [currentPage, user]);

  useEffect(() => {
    if (!user || user.role === "admin" || user.role === "superuser") return;
    let cancelled = false;

    const checkMaintenance = async () => {
      try {
        const state = await getMaintenanceStatus();
        if (cancelled) return;

        if (state?.maintenance === true) {
          localStorage.setItem("maintenanceState", JSON.stringify(state));
          setCurrentPage("maintenance");
        } else if (currentPage === "maintenance") {
          setCurrentPage("general-search");
        }
      } catch {
        // Ignore maintenance polling errors.
      }
    };

    void checkMaintenance();
    const timer = window.setInterval(checkMaintenance, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentPage, user]);

  useEffect(() => {
    if (!user || currentPage !== "monitor") return;
    if (featureLockdown) return;
    if (isPageEnabled(user.role, "monitor", tabVisibility, tabVisibilityLoaded)) return;

    setCurrentPage("forbidden");
    replaceHistory("/403");
  }, [currentPage, featureLockdown, tabVisibility, tabVisibilityLoaded, user]);

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
      (monitorSection === "monitor" && monitorVisibility.monitor) ||
      (monitorSection === "dashboard" && monitorVisibility.dashboard) ||
      (monitorSection === "activity" && monitorVisibility.activity) ||
      (monitorSection === "analysis" && monitorVisibility.analysis) ||
      (monitorSection === "audit" && monitorVisibility.audit);

    if (!requestedAllowed) {
      setMonitorSection(getDefaultMonitorSection(user.role, tabVisibility, tabVisibilityLoaded));
    }
  }, [currentPage, monitorSection, monitorVisibility, tabVisibility, tabVisibilityLoaded, user]);

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
  }, [currentPage, featureLockdown, tabVisibility, tabVisibilityLoaded, user]);

  const handleLoginSuccess = useCallback((loggedInUser: User) => {
    setUser(loggedInUser);
    setCurrentPage(loggedInUser.role === "user" ? "general-search" : "home");
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await activityLogout(localStorage.getItem("activityId") || undefined);
    } catch (error) {
      console.warn("Logout activity failed:", error);
    }
    applyLoggedOutClientState(true);
  }, [applyLoggedOutClientState]);

  const handleNavigate = useCallback((page: string, importId?: string) => {
    const monitorSectionTarget = parseMonitorSectionFromPageInput(page);
    const requestedPage = monitorSectionTarget ? "monitor" : page;

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
      if (nextSection === "monitor" && !monitorVisibility.monitor) {
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
  }, [featureLockdown, monitorVisibility.monitor, tabVisibility, tabVisibilityLoaded, user?.role]);

  const handleMonitorSectionChange = useCallback((section: MonitorSection) => {
    setMonitorSection((previous) => (previous === section ? previous : section));
    replaceHistory(buildPathForPage("monitor", section));
  }, []);

  if (!isInitialized) {
    return <PageSpinner fullscreen />;
  }

  if (localStorage.getItem("banned") === "1") {
    return (
      <Suspense fallback={<PageSpinner fullscreen />}>
        <BannedPage />
      </Suspense>
    );
  }

  if (!user) {
    if (currentPage === "maintenance") {
      return (
        <Suspense fallback={<PageSpinner fullscreen />}>
          <MaintenanceRoutePage />
        </Suspense>
      );
    }

    return (
      <Suspense fallback={<PageSpinner fullscreen />}>
        <LoginPage onLoginSuccess={handleLoginSuccess} />
      </Suspense>
    );
  }

  if (currentPage === "maintenance" && user.role === "user") {
    return (
      <Suspense fallback={<PageSpinner fullscreen />}>
        <MaintenanceRoutePage />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AutoLogout
        onLogout={handleLogout}
        timeoutMinutes={runtimeConfig.sessionTimeoutMinutes}
        heartbeatIntervalMinutes={runtimeConfig.heartbeatIntervalMinutes}
        username={user.username}
      />
      <Navbar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        userRole={user.role}
        username={user.username}
        systemName={systemName}
        savedCount={savedCount}
        tabVisibility={tabVisibility}
        featureLockdown={featureLockdown}
      />
      <Suspense fallback={<PageSpinner />}>
        <main className="min-h-[calc(100vh-3.5rem)]">
          <AppPageRenderer
            user={user}
            currentPage={currentPage}
            monitorSection={monitorSection}
            selectedImportId={selectedImportId}
            runtimeConfig={runtimeConfig}
            tabVisibility={tabVisibility}
            tabVisibilityLoaded={tabVisibilityLoaded}
            monitorVisibility={monitorVisibility}
            featureLockdown={featureLockdown}
            onNavigate={handleNavigate}
            onMonitorSectionChange={handleMonitorSectionChange}
          />
        </main>
      </Suspense>
      {runtimeConfig.aiEnabled ? (
        <FloatingAI
          timeoutMs={runtimeConfig.aiTimeoutMs}
          aiEnabled={runtimeConfig.aiEnabled}
          activePage={currentPage}
        />
      ) : null}
    </div>
  );
}

function App() {
  return (
    <AppProviders>
      <AppContent />
    </AppProviders>
  );
}

export default App;
