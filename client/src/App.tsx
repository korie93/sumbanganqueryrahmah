import { lazy, Suspense, useState, useEffect, useCallback } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Navbar from "@/components/Navbar";
import AutoLogout from "@/components/AutoLogout";
import FloatingAI from "@/components/FloatingAI";
import { AIProvider } from "@/context/AIContext";
import { activityLogout, getAppConfig, getImports, getMaintenanceStatus, getTabVisibility } from "@/lib/api";

const Login = lazy(() => import("@/pages/Login"));
const Home = lazy(() => import("@/pages/Home"));
const Import = lazy(() => import("@/pages/Import"));
const Saved = lazy(() => import("@/pages/Saved"));
const Viewer = lazy(() => import("@/pages/Viewer"));
const GeneralSearch = lazy(() => import("@/pages/GeneralSearch"));
const BackupRestore = lazy(() => import("@/pages/BackupRestore"));
const AI = lazy(() => import("@/pages/AI"));
const Banned = lazy(() => import("@/pages/Banned"));
const SettingsPage = lazy(() => import("@/pages/Settings"));
const MaintenancePage = lazy(() => import("@/pages/Maintenance"));
const SystemMonitorLayout = lazy(() => import("@/pages/SystemMonitorLayout"));
const Forbidden = lazy(() => import("@/pages/Forbidden"));

interface User {
  username: string;
  role: string;
}

type AppRuntimeConfig = {
  sessionTimeoutMinutes: number;
  heartbeatIntervalMinutes: number;
  aiTimeoutMs: number;
  aiEnabled: boolean;
  searchResultLimit: number;
  viewerRowsPerPage: number;
};

type MonitorSection = "dashboard" | "activity" | "monitor" | "analysis" | "audit";

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState("home");
  const [monitorSection, setMonitorSection] = useState<MonitorSection>("monitor");
  const [selectedImportId, setSelectedImportId] = useState<string | undefined>();
  const [isInitialized, setIsInitialized] = useState(false);
  const [savedCount, setSavedCount] = useState<number>(0);
  const [systemName, setSystemName] = useState<string>("SQR System");
  const [tabVisibility, setTabVisibility] = useState<Record<string, boolean> | null>(null);
  const [tabVisibilityLoaded, setTabVisibilityLoaded] = useState(false);
  const [runtimeConfig, setRuntimeConfig] = useState<AppRuntimeConfig>({
    sessionTimeoutMinutes: 30,
    heartbeatIntervalMinutes: 5,
    aiTimeoutMs: 6000,
    aiEnabled: true,
    searchResultLimit: 200,
    viewerRowsPerPage: 100,
  });

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

  const isSuperuserFeatureOffMode = useCallback((role: string | undefined, tabs: Record<string, boolean> | null) => {
    if (!role || role === "superuser") return false;
    if (!tabVisibilityLoaded || !tabs) return false;
    const nonSearchEntries = Object.entries(tabs).filter(([key]) => key !== "general-search" && key !== "canViewSystemPerformance");
    if (nonSearchEntries.length === 0) return false;
    return nonSearchEntries.every(([, enabled]) => enabled === false);
  }, [tabVisibilityLoaded]);

  const getDefaultPageForRole = useCallback((role: string, tabs: Record<string, boolean> | null) => {
    if (isSuperuserFeatureOffMode(role, tabs)) return "general-search";
    if (role === "superuser") return "home";
    const candidates = role === "user"
      ? ["general-search"]
      : ["home", "general-search", "saved"];
    for (const candidate of candidates) {
      if (candidate === "general-search" && isSuperuserFeatureOffMode(role, tabs)) return "general-search";
      if (!tabs || tabs[candidate] !== false) return candidate;
    }
    return role === "user" ? "general-search" : "home";
  }, [isSuperuserFeatureOffMode]);

  const canViewMonitorSection = useCallback((role: string | undefined, tabs: Record<string, boolean> | null) => {
    if (role === "superuser") return true;
    if (role === "admin") {
      if (!tabs) return true;
      return tabs.monitor !== false;
    }
    if (role === "user") {
      if (!tabVisibilityLoaded) return true;
      return tabs?.monitor === true;
    }
    return false;
  }, [tabVisibilityLoaded]);

  const canViewDashboardSection = useCallback((role: string | undefined, tabs: Record<string, boolean> | null) => {
    if (!role || role === "superuser") return true;
    if (!tabs) return true;
    return tabs.dashboard !== false;
  }, []);

  const canViewActivitySection = useCallback((role: string | undefined, tabs: Record<string, boolean> | null) => {
    if (!role || role === "superuser") return true;
    if (!tabs) return true;
    return tabs.activity !== false;
  }, []);

  const canViewAnalysisSection = useCallback((role: string | undefined, tabs: Record<string, boolean> | null) => {
    if (!role || role === "superuser") return true;
    if (!tabs) return true;
    return tabs.analysis !== false;
  }, []);

  const canViewAuditSection = useCallback((role: string | undefined, tabs: Record<string, boolean> | null) => {
    if (!role || role === "superuser") return true;
    if (!tabs) return true;
    if (Object.prototype.hasOwnProperty.call(tabs, "audit")) {
      return tabs.audit !== false;
    }
    if (Object.prototype.hasOwnProperty.call(tabs, "audit-logs")) {
      return tabs["audit-logs"] !== false;
    }
    return false;
  }, []);

  const getMonitorSectionVisibility = useCallback((role: string | undefined, tabs: Record<string, boolean> | null) => ({
    dashboard: canViewDashboardSection(role, tabs),
    activity: canViewActivitySection(role, tabs),
    monitor: canViewMonitorSection(role, tabs),
    analysis: canViewAnalysisSection(role, tabs),
    audit: canViewAuditSection(role, tabs),
  }), [canViewActivitySection, canViewAnalysisSection, canViewAuditSection, canViewDashboardSection, canViewMonitorSection]);

  const getDefaultMonitorSection = useCallback((role: string | undefined, tabs: Record<string, boolean> | null): MonitorSection => {
    const visibility = getMonitorSectionVisibility(role, tabs);
    if (visibility.monitor) return "monitor";
    if (visibility.dashboard) return "dashboard";
    if (visibility.activity) return "activity";
    if (visibility.analysis) return "analysis";
    if (visibility.audit) return "audit";
    return "monitor";
  }, [getMonitorSectionVisibility]);

  const parseMonitorSectionFromQuery = useCallback((search: string): MonitorSection | null => {
    const section = new URLSearchParams(search).get("section");
    if (section === "dashboard" || section === "activity" || section === "monitor" || section === "analysis" || section === "audit") return section;
    if (section === "audit-logs") return "audit";
    return null;
  }, []);

  const parseMonitorSectionFromPageInput = useCallback((page: string): MonitorSection | null => {
    if (!page) return null;
    if (page === "monitor") return "monitor";
    if (page === "dashboard") return "dashboard";
    if (page === "activity") return "activity";
    if (page === "analysis") return "analysis";
    if (page === "audit" || page === "audit-logs") return "audit";
    if (!page.startsWith("/monitor")) return null;

    try {
      const url = new URL(page, window.location.origin);
      if (url.pathname.toLowerCase() !== "/monitor") return null;
      return parseMonitorSectionFromQuery(url.search) || "monitor";
    } catch {
      return null;
    }
  }, [parseMonitorSectionFromQuery]);

  const isPageEnabled = useCallback((role: string | undefined, page: string, tabs: Record<string, boolean> | null) => {
    if (isSuperuserFeatureOffMode(role, tabs)) {
      return page === "general-search" || page === "forbidden" || page === "maintenance";
    }
    if (page === "monitor") {
      const visibility = getMonitorSectionVisibility(role, tabs);
      return visibility.monitor || visibility.dashboard || visibility.activity || visibility.analysis || visibility.audit;
    }
    if (page === "dashboard") return canViewDashboardSection(role, tabs);
    if (page === "activity") return canViewActivitySection(role, tabs);
    if (page === "analysis") return canViewAnalysisSection(role, tabs);
    if (page === "audit" || page === "audit-logs") return canViewAuditSection(role, tabs);
    if (!role || role === "superuser") return true;
    if (!tabs) return true;
    return tabs[page] !== false;
  }, [canViewActivitySection, canViewAnalysisSection, canViewAuditSection, canViewDashboardSection, getMonitorSectionVisibility, isSuperuserFeatureOffMode]);

  useEffect(() => {
    const pathname = typeof window !== "undefined" ? window.location.pathname.toLowerCase() : "/";
    const search = typeof window !== "undefined" ? window.location.search : "";
    const requestedMonitorSection = parseMonitorSectionFromQuery(search);
    if (pathname === "/maintenance") {
      setCurrentPage("maintenance");
    } else if (pathname === "/settings") {
      setCurrentPage("settings");
    } else if (pathname === "/dashboard") {
      setCurrentPage("monitor");
      setMonitorSection("dashboard");
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", "/monitor?section=dashboard");
      }
    } else if (pathname === "/activity") {
      setCurrentPage("monitor");
      setMonitorSection("activity");
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", "/monitor?section=activity");
      }
    } else if (pathname === "/analysis") {
      setCurrentPage("monitor");
      setMonitorSection("analysis");
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", "/monitor?section=analysis");
      }
    } else if (pathname === "/audit" || pathname === "/audit-logs") {
      setCurrentPage("monitor");
      setMonitorSection("audit");
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", "/monitor?section=audit");
      }
    } else if (pathname === "/monitor") {
      setCurrentPage("monitor");
      setMonitorSection(requestedMonitorSection || "monitor");
    } else if (pathname === "/403") {
      setCurrentPage("forbidden");
    }

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

        if (pathname === "/maintenance") {
          setCurrentPage("maintenance");
        } else if (pathname === "/settings") {
          setCurrentPage("settings");
        } else if (pathname === "/dashboard") {
          setCurrentPage("monitor");
          setMonitorSection("dashboard");
          if (typeof window !== "undefined") {
            window.history.replaceState({}, "", "/monitor?section=dashboard");
          }
        } else if (pathname === "/activity") {
          setCurrentPage("monitor");
          setMonitorSection("activity");
          if (typeof window !== "undefined") {
            window.history.replaceState({}, "", "/monitor?section=activity");
          }
        } else if (pathname === "/analysis") {
          setCurrentPage("monitor");
          setMonitorSection("analysis");
          if (typeof window !== "undefined") {
            window.history.replaceState({}, "", "/monitor?section=analysis");
          }
        } else if (pathname === "/audit" || pathname === "/audit-logs") {
          setCurrentPage("monitor");
          setMonitorSection("audit");
          if (typeof window !== "undefined") {
            window.history.replaceState({}, "", "/monitor?section=audit");
          }
        } else if (pathname === "/monitor") {
          setCurrentPage("monitor");
          setMonitorSection(requestedMonitorSection || "monitor");
        } else if (pathname === "/403") {
          setCurrentPage("forbidden");
        } else if (parsedUser.role === "user") {
          setCurrentPage(savedPage === "settings" ? "settings" : "general-search");
        } else if (savedPage) {
          if (savedPage === "dashboard" || savedPage === "activity" || savedPage === "monitor" || savedPage === "analysis" || savedPage === "audit" || savedPage === "audit-logs") {
            setCurrentPage("monitor");
            setMonitorSection(savedPage === "monitor" ? "monitor" : savedPage === "audit-logs" ? "audit" : savedPage as MonitorSection);
          } else {
            setCurrentPage(savedPage);
          }
        }
      } catch {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      }
    }

    setIsInitialized(true);
  }, [parseMonitorSectionFromQuery]);

  useEffect(() => {
    if (user && user.role !== "user") {
      fetchSavedCount();
    }
  }, [user, fetchSavedCount]);

  useEffect(() => {
    const onProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ username?: string; role?: string }>).detail;
      if (!detail?.username || !detail?.role) return;
      setUser((prev) => {
        if (!prev) {
          return { username: detail.username!, role: detail.role! };
        }
        return { ...prev, username: detail.username, role: detail.role };
      });
    };

    window.addEventListener("profile-updated", onProfileUpdated as EventListener);
    return () => window.removeEventListener("profile-updated", onProfileUpdated as EventListener);
  }, []);

  useEffect(() => {
    if (!user) {
      setSystemName("SQR System");
      setRuntimeConfig({
        sessionTimeoutMinutes: 30,
        heartbeatIntervalMinutes: 5,
        aiTimeoutMs: 6000,
        aiEnabled: true,
        searchResultLimit: 200,
        viewerRowsPerPage: 100,
      });
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
          setSystemName(name || "SQR System");
          setRuntimeConfig({
            sessionTimeoutMinutes: Number.isFinite(sessionTimeoutMinutes) ? Math.max(1, sessionTimeoutMinutes) : 30,
            heartbeatIntervalMinutes: Number.isFinite(heartbeatIntervalMinutes) ? Math.max(1, heartbeatIntervalMinutes) : 5,
            aiTimeoutMs: Number.isFinite(aiTimeoutMs) ? Math.max(1000, aiTimeoutMs) : 6000,
            aiEnabled: response?.aiEnabled !== false,
            searchResultLimit: Number.isFinite(searchResultLimit) ? Math.min(5000, Math.max(10, Math.floor(searchResultLimit))) : 200,
            viewerRowsPerPage: Number.isFinite(viewerRowsPerPage) ? Math.min(500, Math.max(10, Math.floor(viewerRowsPerPage))) : 100,
          });
        }
      } catch {
        if (!cancelled) {
          setSystemName("SQR System");
          setRuntimeConfig({
            sessionTimeoutMinutes: 30,
            heartbeatIntervalMinutes: 5,
            aiTimeoutMs: 6000,
            aiEnabled: true,
            searchResultLimit: 200,
            viewerRowsPerPage: 100,
          });
        }
      }
    };

    loadAppRuntimeConfig();
    const onSettingsUpdated = () => {
      loadAppRuntimeConfig();
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

    loadTabVisibility();

    const onSettingsUpdated = () => {
      loadTabVisibility();
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
        // ignore polling errors
      }
    };

    checkMaintenance();
    const timer = setInterval(checkMaintenance, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [user, currentPage]);

  useEffect(() => {
    if (!user || currentPage !== "monitor") return;
    if (isSuperuserFeatureOffMode(user.role, tabVisibility)) return;
    if (isPageEnabled(user.role, "monitor", tabVisibility)) return;
    setCurrentPage("forbidden");
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/403");
    }
  }, [user, currentPage, tabVisibility, isPageEnabled, isSuperuserFeatureOffMode]);

  useEffect(() => {
    if (!user || currentPage !== "monitor") return;
    const visibility = getMonitorSectionVisibility(user.role, tabVisibility);
    const hasExplicitMonitorSectionQuery = typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).has("section")
      : false;
    if (monitorSection === "monitor" && !visibility.monitor) {
      if (hasExplicitMonitorSectionQuery) {
        setCurrentPage("forbidden");
        if (typeof window !== "undefined") {
          window.history.replaceState({}, "", "/403");
        }
        return;
      }
      setMonitorSection(getDefaultMonitorSection(user.role, tabVisibility));
      return;
    }
    const requestedAllowed =
      (monitorSection === "monitor" && visibility.monitor) ||
      (monitorSection === "dashboard" && visibility.dashboard) ||
      (monitorSection === "activity" && visibility.activity) ||
      (monitorSection === "analysis" && visibility.analysis) ||
      (monitorSection === "audit" && visibility.audit);
    if (requestedAllowed) return;
    setMonitorSection(getDefaultMonitorSection(user.role, tabVisibility));
  }, [user, currentPage, tabVisibility, monitorSection, getDefaultMonitorSection, getMonitorSectionVisibility]);

  useEffect(() => {
    if (!user) return;
    if (isPageEnabled(user.role, currentPage, tabVisibility)) return;
    if (isSuperuserFeatureOffMode(user.role, tabVisibility)) {
      setCurrentPage("general-search");
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", "/");
      }
      return;
    }
    if (currentPage === "monitor") {
      setCurrentPage("forbidden");
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", "/403");
      }
      return;
    }
    setCurrentPage(getDefaultPageForRole(user.role, tabVisibility));
  }, [user, currentPage, tabVisibility, isPageEnabled, getDefaultPageForRole, isSuperuserFeatureOffMode]);

  // Heartbeat is handled by <AutoLogout /> and follows runtime settings.

  const handleLoginSuccess = useCallback((loggedInUser: User) => {
    setUser(loggedInUser);
    if (loggedInUser.role === "user") {
      setCurrentPage("general-search");
    } else {
      setCurrentPage("home");
    }
  }, []);

  const handleLogout = useCallback(async () => {
    const activityId = localStorage.getItem("activityId");
    if (activityId) {
      try {
        await activityLogout(activityId);
      } catch (err) {
        console.warn("Logout activity failed:", err);
      }
    }

    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("username");
    localStorage.removeItem("role");
    localStorage.removeItem("activityId");
    localStorage.removeItem("activeTab");
    localStorage.removeItem("lastPage");
    localStorage.removeItem("selectedImportId");
    localStorage.removeItem("selectedImportName");
    localStorage.removeItem("fingerprint");

    setUser(null);
    setCurrentPage("home");
  }, []);

  const handleNavigate = useCallback((page: string, importId?: string) => {
    const monitorSectionTarget = parseMonitorSectionFromPageInput(page);
    const requestedPage = monitorSectionTarget ? "monitor" : page;
    if (isSuperuserFeatureOffMode(user?.role, tabVisibility) && requestedPage !== "general-search") {
      setCurrentPage("general-search");
      localStorage.setItem("activeTab", "general-search");
      localStorage.setItem("lastPage", "general-search");
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", "/");
      }
      return;
    }
    if (!isPageEnabled(user?.role, requestedPage, tabVisibility)) {
      if (requestedPage === "monitor") {
        setCurrentPage("forbidden");
        localStorage.setItem("activeTab", "forbidden");
        localStorage.setItem("lastPage", "forbidden");
        if (typeof window !== "undefined") {
          window.history.replaceState({}, "", "/403");
        }
        return;
      }
      setCurrentPage(getDefaultPageForRole(user?.role || "user", tabVisibility));
      return;
    }

    if (monitorSectionTarget) {
      const visibility = getMonitorSectionVisibility(user?.role, tabVisibility);
      let nextSection: MonitorSection = monitorSectionTarget;
      if (nextSection === "monitor" && !visibility.monitor) {
        nextSection = getDefaultMonitorSection(user?.role, tabVisibility);
      }
      setCurrentPage("monitor");
      setMonitorSection(nextSection);
      localStorage.setItem("activeTab", "monitor");
      localStorage.setItem("lastPage", "monitor");
      if (typeof window !== "undefined") {
        const targetUrl = `/monitor?section=${nextSection}`;
        const currentUrl = `${window.location.pathname}${window.location.search}`;
        if (currentUrl !== targetUrl) {
          window.history.replaceState({}, "", targetUrl);
        }
      }
      return;
    }

    setCurrentPage(requestedPage);
    localStorage.setItem("activeTab", requestedPage);
    localStorage.setItem("lastPage", requestedPage);

    if (typeof window !== "undefined") {
      if (requestedPage === "settings") window.history.replaceState({}, "", "/settings");
      else if (requestedPage === "maintenance") window.history.replaceState({}, "", "/maintenance");
      else if (requestedPage === "forbidden") window.history.replaceState({}, "", "/403");
      else window.history.replaceState({}, "", "/");
    }

    if (importId) {
      setSelectedImportId(importId);
    }
  }, [user?.role, tabVisibility, isPageEnabled, getDefaultPageForRole, parseMonitorSectionFromPageInput, isSuperuserFeatureOffMode, getMonitorSectionVisibility, getDefaultMonitorSection]);

  const handleMonitorSectionChange = useCallback((section: MonitorSection) => {
    setMonitorSection((prev) => (prev === section ? prev : section));
    if (typeof window !== "undefined") {
      const targetUrl = `/monitor?section=${section}`;
      const currentUrl = `${window.location.pathname}${window.location.search}`;
      if (currentUrl !== targetUrl) {
        window.history.replaceState({}, "", targetUrl);
      }
    }
  }, []);

  const pageFallback = (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  const isFeatureLockdownMode = isSuperuserFeatureOffMode(user?.role, tabVisibility);

  if (!isInitialized) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  if (localStorage.getItem("banned") === "1") {
    return (
      <Suspense fallback={pageFallback}>
        <Banned />
      </Suspense>
    );
  }

  if (!user) {
    if (currentPage === "maintenance") {
      return (
        <Suspense fallback={pageFallback}>
          <MaintenancePage />
        </Suspense>
      );
    }
    return (
      <Suspense fallback={pageFallback}>
        <Login onLoginSuccess={handleLoginSuccess} />
      </Suspense>
    );
  }

  if (currentPage === "maintenance" && user.role === "user") {
    return (
      <Suspense fallback={pageFallback}>
        <MaintenancePage />
      </Suspense>
    );
  }

  const monitorVisibility = getMonitorSectionVisibility(user.role, tabVisibility);

  const renderPage = () => {
    if (!isPageEnabled(user.role, currentPage, tabVisibility)) {
      if (isFeatureLockdownMode) {
        return <GeneralSearch userRole={user.role} searchResultLimit={runtimeConfig.searchResultLimit} />;
      }
      if (currentPage === "monitor") {
        return <Forbidden />;
      }
      return user.role === "user"
        ? <GeneralSearch userRole={user.role} searchResultLimit={runtimeConfig.searchResultLimit} />
        : <Home onNavigate={handleNavigate} userRole={user.role} tabVisibility={tabVisibility} />;
    }

    switch (currentPage) {
      case "home":
        return <Home onNavigate={handleNavigate} userRole={user.role} tabVisibility={tabVisibility} />;
      case "import":
        return <Import onNavigate={handleNavigate} />;
      case "saved":
        return <Saved onNavigate={handleNavigate} userRole={user.role} />;
      case "viewer":
        return <Viewer onNavigate={handleNavigate} importId={selectedImportId} userRole={user.role} viewerRowsPerPage={runtimeConfig.viewerRowsPerPage} />;
      case "general-search":
        return <GeneralSearch userRole={user.role} searchResultLimit={runtimeConfig.searchResultLimit} />;
      case "backup":
      return <BackupRestore userRole={user.role} />;
      case "ai":
        if (!runtimeConfig.aiEnabled) {
          return <GeneralSearch userRole={user.role} searchResultLimit={runtimeConfig.searchResultLimit} />;
        }
        return <AI timeoutMs={runtimeConfig.aiTimeoutMs} aiEnabled={runtimeConfig.aiEnabled} />;
      case "settings":
        return <SettingsPage />;
      case "maintenance":
        return <MaintenancePage />;
      case "analysis":
      case "audit":
      case "audit-logs":
      case "dashboard":
      case "activity":
      case "monitor":
        return (
          <SystemMonitorLayout
            showDashboard={monitorVisibility.dashboard}
            showActivity={monitorVisibility.activity}
            showSystemPerformance={monitorVisibility.monitor}
            showAnalysis={monitorVisibility.analysis}
            showAuditLogs={monitorVisibility.audit}
            requestedSection={monitorSection}
            onNavigate={handleNavigate}
            onSectionChange={handleMonitorSectionChange}
          />
        );
      case "forbidden":
        return <Forbidden />;
      default:
        return user.role === "user"
          ? <GeneralSearch userRole={user.role} searchResultLimit={runtimeConfig.searchResultLimit} />
          : <Home onNavigate={handleNavigate} userRole={user.role} tabVisibility={tabVisibility} />;
    }
  };

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
        featureLockdown={isFeatureLockdownMode}
      />
      <Suspense fallback={pageFallback}>
        <main>{renderPage()}</main>
      </Suspense>
      <FloatingAI
        timeoutMs={runtimeConfig.aiTimeoutMs}
        aiEnabled={runtimeConfig.aiEnabled}
        activePage={currentPage}
      />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AIProvider>
        <TooltipProvider>
          <Toaster />
          <AppContent />
        </TooltipProvider>
      </AIProvider>
    </QueryClientProvider>
  );
}

export default App;
