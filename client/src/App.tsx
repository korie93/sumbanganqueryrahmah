import { lazy, Suspense, useState, useEffect, useCallback } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Navbar from "@/components/Navbar";
import AutoLogout from "@/components/AutoLogout";
import { activityLogout, getAppConfig, getImports, getMaintenanceStatus, getTabVisibility } from "@/lib/api";

const Login = lazy(() => import("@/pages/Login"));
const Home = lazy(() => import("@/pages/Home"));
const Import = lazy(() => import("@/pages/Import"));
const Saved = lazy(() => import("@/pages/Saved"));
const Viewer = lazy(() => import("@/pages/Viewer"));
const GeneralSearch = lazy(() => import("@/pages/GeneralSearch"));
const Analysis = lazy(() => import("@/pages/Analysis"));
const Activity = lazy(() => import("@/pages/Activity"));
const AuditLogs = lazy(() => import("@/pages/AuditLogs"));
const BackupRestore = lazy(() => import("@/pages/BackupRestore"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const AI = lazy(() => import("@/pages/AI"));
const Banned = lazy(() => import("@/pages/Banned"));
const SettingsPage = lazy(() => import("@/pages/Settings"));
const MaintenancePage = lazy(() => import("@/pages/Maintenance"));
const Monitor = lazy(() => import("@/pages/Monitor"));
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
};

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState("home");
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

  const getDefaultPageForRole = useCallback((role: string, tabs: Record<string, boolean> | null) => {
    if (role === "superuser") return "home";
    const candidates = role === "user"
      ? ["general-search", "ai"]
      : ["home", "general-search", "ai", "saved"];
    for (const candidate of candidates) {
      if (!tabs || tabs[candidate] !== false) return candidate;
    }
    return role === "user" ? "general-search" : "home";
  }, []);

  const isPageEnabled = useCallback((role: string | undefined, page: string, tabs: Record<string, boolean> | null) => {
    if (page === "monitor") {
      if (role === "admin" || role === "superuser") return true;
      if (role === "user") {
        if (!tabVisibilityLoaded) return true;
        return tabs?.monitor === true;
      }
      return false;
    }
    if (!role || role === "superuser") return true;
    if (!tabs) return true;
    return tabs[page] !== false;
  }, [tabVisibilityLoaded]);

  useEffect(() => {
    const pathname = typeof window !== "undefined" ? window.location.pathname.toLowerCase() : "/";
    if (pathname === "/maintenance") {
      setCurrentPage("maintenance");
    } else if (pathname === "/settings") {
      setCurrentPage("settings");
    } else if (pathname === "/monitor") {
      setCurrentPage("monitor");
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
        } else if (pathname === "/settings" && parsedUser.role !== "user") {
          setCurrentPage("settings");
        } else if (pathname === "/monitor") {
          setCurrentPage("monitor");
        } else if (pathname === "/403") {
          setCurrentPage("forbidden");
        } else if (parsedUser.role === "user") {
          setCurrentPage("general-search");
        } else if (savedPage) {
          setCurrentPage(savedPage);
        }
      } catch {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
      }
    }

    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (user && user.role !== "user") {
      fetchSavedCount();
    }
  }, [user, fetchSavedCount]);

  useEffect(() => {
    if (!user) {
      setSystemName("SQR System");
      setRuntimeConfig({
        sessionTimeoutMinutes: 30,
        heartbeatIntervalMinutes: 5,
        aiTimeoutMs: 6000,
        aiEnabled: true,
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
        if (!cancelled) {
          setSystemName(name || "SQR System");
          setRuntimeConfig({
            sessionTimeoutMinutes: Number.isFinite(sessionTimeoutMinutes) ? Math.max(1, sessionTimeoutMinutes) : 30,
            heartbeatIntervalMinutes: Number.isFinite(heartbeatIntervalMinutes) ? Math.max(1, heartbeatIntervalMinutes) : 5,
            aiTimeoutMs: Number.isFinite(aiTimeoutMs) ? Math.max(1000, aiTimeoutMs) : 6000,
            aiEnabled: response?.aiEnabled !== false,
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
    if (isPageEnabled(user.role, "monitor", tabVisibility)) return;
    setCurrentPage("forbidden");
    if (typeof window !== "undefined") {
      window.history.replaceState({}, "", "/403");
    }
  }, [user, currentPage, tabVisibility, isPageEnabled]);

  useEffect(() => {
    if (!user) return;
    if (isPageEnabled(user.role, currentPage, tabVisibility)) return;
    if (currentPage === "monitor") {
      setCurrentPage("forbidden");
      if (typeof window !== "undefined") {
        window.history.replaceState({}, "", "/403");
      }
      return;
    }
    setCurrentPage(getDefaultPageForRole(user.role, tabVisibility));
  }, [user, currentPage, tabVisibility, isPageEnabled, getDefaultPageForRole]);

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
    if (!isPageEnabled(user?.role, page, tabVisibility)) {
      if (page === "monitor") {
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

    setCurrentPage(page);
    localStorage.setItem("activeTab", page);
    localStorage.setItem("lastPage", page);

    if (typeof window !== "undefined") {
      if (page === "settings") window.history.replaceState({}, "", "/settings");
      else if (page === "maintenance") window.history.replaceState({}, "", "/maintenance");
      else if (page === "monitor") window.history.replaceState({}, "", "/monitor");
      else if (page === "forbidden") window.history.replaceState({}, "", "/403");
      else window.history.replaceState({}, "", "/");
    }

    if (importId) {
      setSelectedImportId(importId);
    }
  }, [user?.role, tabVisibility, isPageEnabled, getDefaultPageForRole]);

  const pageFallback = (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

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

  const renderPage = () => {
    if (!isPageEnabled(user.role, currentPage, tabVisibility)) {
      if (currentPage === "monitor") {
        return <Forbidden />;
      }
      return user.role === "user"
        ? <GeneralSearch userRole={user.role} />
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
        return <Viewer onNavigate={handleNavigate} importId={selectedImportId} userRole={user.role} />;
      case "general-search":
        return <GeneralSearch userRole={user.role} />;
      case "analysis":
        return <Analysis onNavigate={handleNavigate} />;
      case "activity":
        return <Activity />;
      case "audit-logs":
        return <AuditLogs />;
      case "backup":
      return <BackupRestore userRole={user.role} />;
      case "ai":
        if (!runtimeConfig.aiEnabled) {
          return <GeneralSearch userRole={user.role} />;
        }
        return <AI timeoutMs={runtimeConfig.aiTimeoutMs} aiEnabled={runtimeConfig.aiEnabled} />;
      case "dashboard":
        return <Dashboard />;
      case "settings":
        return user.role === "user" ? <GeneralSearch userRole={user.role} /> : <SettingsPage />;
      case "maintenance":
        return <MaintenancePage />;
      case "monitor":
        return <Monitor />;
      case "forbidden":
        return <Forbidden />;
      default:
        return user.role === "user"
          ? <GeneralSearch userRole={user.role} />
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
      />
      <Suspense fallback={pageFallback}>
        <main>{renderPage()}</main>
      </Suspense>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
