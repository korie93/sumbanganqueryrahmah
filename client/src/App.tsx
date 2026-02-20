import { lazy, Suspense, useState, useEffect, useCallback } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Navbar from "@/components/Navbar";
import AutoLogout from "@/components/AutoLogout";
import { activityLogout, getImports, getMaintenanceStatus } from "@/lib/api";

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

interface User {
  username: string;
  role: string;
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [currentPage, setCurrentPage] = useState("home");
  const [selectedImportId, setSelectedImportId] = useState<string | undefined>();
  const [isInitialized, setIsInitialized] = useState(false);
  const [savedCount, setSavedCount] = useState<number>(0);

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

  useEffect(() => {
    const pathname = typeof window !== "undefined" ? window.location.pathname.toLowerCase() : "/";
    if (pathname === "/maintenance") {
      setCurrentPage("maintenance");
    } else if (pathname === "/settings") {
      setCurrentPage("settings");
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
    if (!user) return;
    const token = localStorage.getItem("token");
    if (!token) return;

    const interval = setInterval(() => {
      fetch("/api/activity/heartbeat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }).catch(() => {});
    }, 30_000);

    return () => clearInterval(interval);
  }, [user]);

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
    setCurrentPage(page);
    localStorage.setItem("activeTab", page);
    localStorage.setItem("lastPage", page);

    if (typeof window !== "undefined") {
      if (page === "settings") window.history.replaceState({}, "", "/settings");
      else if (page === "maintenance") window.history.replaceState({}, "", "/maintenance");
      else window.history.replaceState({}, "", "/");
    }

    if (importId) {
      setSelectedImportId(importId);
    }
  }, []);

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
    switch (currentPage) {
      case "home":
        return user.role === "user"
          ? <GeneralSearch userRole={user.role} />
          : <Home onNavigate={handleNavigate} userRole={user.role} />;
      case "import":
        return user.role === "user" ? <GeneralSearch userRole={user.role} /> : <Import onNavigate={handleNavigate} />;
      case "saved":
        return user.role === "user" ? <GeneralSearch userRole={user.role} /> : <Saved onNavigate={handleNavigate} userRole={user.role} />;
      case "viewer":
        return user.role === "user"
          ? <GeneralSearch userRole={user.role} />
          : <Viewer onNavigate={handleNavigate} importId={selectedImportId} userRole={user.role} />;
      case "general-search":
        return <GeneralSearch userRole={user.role} />;
      case "analysis":
        return user.role === "user" ? <GeneralSearch userRole={user.role} /> : <Analysis onNavigate={handleNavigate} />;
      case "activity":
        if (user.role !== "superuser") return user.role === "user" ? <GeneralSearch userRole={user.role} /> : <Home onNavigate={handleNavigate} userRole={user.role} />;
        return <Activity />;
      case "audit-logs":
        if (user.role !== "superuser") return user.role === "user" ? <GeneralSearch userRole={user.role} /> : <Home onNavigate={handleNavigate} userRole={user.role} />;
        return <AuditLogs />;
      case "backup":
        if (user.role !== "superuser") return user.role === "user" ? <GeneralSearch userRole={user.role} /> : <Home onNavigate={handleNavigate} userRole={user.role} />;
        return <BackupRestore />;
      case "ai":
        return <AI />;
      case "dashboard":
        if (user.role !== "superuser") return user.role === "user" ? <GeneralSearch userRole={user.role} /> : <Home onNavigate={handleNavigate} userRole={user.role} />;
        return <Dashboard />;
      case "settings":
        return user.role === "user" ? <GeneralSearch userRole={user.role} /> : <SettingsPage />;
      case "maintenance":
        return <MaintenancePage />;
      default:
        return user.role === "user"
          ? <GeneralSearch userRole={user.role} />
          : <Home onNavigate={handleNavigate} userRole={user.role} />;
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <AutoLogout onLogout={handleLogout} timeoutMinutes={30} heartbeatIntervalMinutes={5} username={user.username} />
      <Navbar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        onLogout={handleLogout}
        userRole={user.role}
        username={user.username}
        savedCount={savedCount}
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
