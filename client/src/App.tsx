import { lazy, Suspense, useState, useEffect, useCallback } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import Navbar from "@/components/Navbar";
import AutoLogout from "@/components/AutoLogout";
import { activityLogout, getImports } from "@/lib/api";

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
        const parsedUser = JSON.parse(savedUser);
        setUser(parsedUser);

        if (parsedUser.role === "user") {
          setCurrentPage("general-search");
        } else if (savedPage) {
          setCurrentPage(savedPage);
        }
      } catch (e) {
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
    if (!user) return;

    const token = localStorage.getItem("token");
    if (!token) return;

    const interval = setInterval(() => {
      fetch("/api/activity/heartbeat", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }).catch(() => { });
    }, 30_000);

    return () => {
      clearInterval(interval);
    };
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

    if (importId) {
      setSelectedImportId(importId);
    }
  }, []);

  if (!isInitialized) {
    return (
      <div className= "min-h-screen bg-background flex items-center justify-center" >
      <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
    );
  }

  const pageFallback = (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );

  if (localStorage.getItem("banned") === "1") {
    return (
      <Suspense fallback={pageFallback}>
        <Banned />
      </Suspense>
    );
  }

  if (!user) {
    return (
      <Suspense fallback={pageFallback}>
        <Login onLoginSuccess={handleLoginSuccess} />
      </Suspense>
    );
  }

  const renderPage = () => {
    switch (currentPage) {
      case "home":
        if (user.role === "user") {
          return <GeneralSearch userRole={ user.role } />;
        }
        return <Home onNavigate={ handleNavigate } userRole = { user.role } />;

      case "import":
        if (user.role === "user") {
          return <GeneralSearch userRole={ user.role } />;
        }
        return <Import onNavigate={ handleNavigate } />;

      case "saved":
        if (user.role === "user") {
          return <GeneralSearch userRole={ user.role } />;
        }
        return <Saved onNavigate={ handleNavigate } userRole = { user.role } />;

      case "viewer":
        if (user.role === "user") {
          return <GeneralSearch userRole={ user.role } />;
        }
        return <Viewer onNavigate={ handleNavigate } importId = { selectedImportId } userRole = { user.role } />;

      case "general-search":
        return <GeneralSearch userRole={ user.role } />;

      case "analysis":
        if (user.role === "user") {
          return <GeneralSearch userRole={ user.role } />;
        }
        return <Analysis onNavigate={ handleNavigate } />;

      case "activity":
        if (user.role !== "superuser") {
          if (user.role === "user") {
            return <GeneralSearch userRole={ user.role } />;
          }
          return <Home onNavigate={ handleNavigate } userRole = { user.role } />;
        }
        return <Activity />;

      case "audit-logs":
        if (user.role !== "superuser") {
          if (user.role === "user") {
            return <GeneralSearch userRole={ user.role } />;
          }
          return <Home onNavigate={ handleNavigate } userRole = { user.role } />;
        }
        return <AuditLogs />;

      case "backup":
        if (user.role !== "superuser") {
          if (user.role === "user") {
            return <GeneralSearch userRole={ user.role } />;
          }
          return <Home onNavigate={ handleNavigate } userRole = { user.role } />;
        }
        return <BackupRestore />;

      case "ai":
        return <AI />;

      case "dashboard":
        if (user.role !== "superuser") {
          if (user.role === "user") {
            return <GeneralSearch userRole={ user.role } />;
          }
          return <Home onNavigate={ handleNavigate } userRole = { user.role } />;
        }
        return <Dashboard />;

      default:
        if (user.role === "user") {
          return <GeneralSearch userRole={ user.role } />;
        }
        return <Home onNavigate={ handleNavigate } userRole = { user.role } />;
    }
  };

  return (
    <div className= "min-h-screen bg-background" >
    <AutoLogout onLogout={ handleLogout } timeoutMinutes = { 30} heartbeatIntervalMinutes = { 5} username = { user.username } />
      <Navbar
        currentPage={ currentPage }
  onNavigate = { handleNavigate }
  onLogout = { handleLogout }
  userRole = { user.role }
  username = { user.username }
  savedCount = { savedCount }
    />
    <Suspense fallback={pageFallback}>
      <main>{ renderPage() } </main>
    </Suspense>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client= { queryClient } >
    <TooltipProvider>
    <Toaster />
    < AppContent />
    </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
