import { Home, Upload, BookMarked, Eye, Search, BarChart3, Activity, FileText, Database, LogOut, ShieldCheck, LayoutDashboard, Sparkles, SlidersHorizontal, Server } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import ThemeToggle from "./ThemeToggle";

interface NavbarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
  userRole: string;
  username: string;
  systemName?: string;
  savedCount?: number;
  tabVisibility?: Record<string, boolean> | null;
}

export default function Navbar({ currentPage, onNavigate, onLogout, userRole, username, systemName, savedCount, tabVisibility }: NavbarProps) {
  const isSuperuser = userRole === "superuser";
  const isAdminOrSuperuser = userRole === "admin" || userRole === "superuser";

  const navItems = [
    { id: "home", label: "Home", icon: Home, roles: ["user", "admin", "superuser"] },
    { id: "import", label: "Import", icon: Upload, roles: ["user", "admin", "superuser"] },
    { id: "saved", label: "Saved", icon: BookMarked, roles: ["user", "admin", "superuser"] },
    { id: "viewer", label: "Viewer", icon: Eye, roles: ["user", "admin", "superuser"] },
    { id: "general-search", label: "Search", icon: Search, roles: ["admin", "superuser", "user"] },
    { id: "analysis", label: "Analysis", icon: BarChart3, roles: ["user", "admin", "superuser"] },
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["user", "admin", "superuser"] },
    { id: "ai", label: "AI", icon: Sparkles, roles: ["user", "admin", "superuser"] },
    { id: "monitor", label: "System Monitor", icon: Server, roles: ["user", "admin", "superuser"] },
    { id: "settings", label: "Settings", icon: SlidersHorizontal, roles: ["admin", "superuser"] },
    { id: "activity", label: "Activity", icon: Activity, roles: ["user", "admin", "superuser"] },
    { id: "audit-logs", label: "Audit", icon: FileText, roles: ["user", "admin", "superuser"] },
    { id: "backup", label: "Backup", icon: Database, roles: ["user", "admin", "superuser"] },
  ];

  const visibleItems = navItems.filter((item) => {
    if (!item.roles.includes(userRole)) return false;
    if (item.id === "monitor") {
      if (userRole === "admin" || userRole === "superuser") return true;
      return tabVisibility?.monitor === true;
    }
    if (userRole === "superuser") return true;
    if (!tabVisibility) return true;
    return tabVisibility[item.id] !== false;
  });

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-lg">
      <div className="flex h-14 items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4 text-primary" />
            </div>
            <span className="font-semibold text-sm hidden sm:inline">{systemName || "SQR System"}</span>
          </div>
        </div>

        <nav className="navbar-premium-glass">
          {visibleItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;
            const showBadge = item.id === "saved" && savedCount !== undefined && savedCount > 0;
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onNavigate(item.id)}
                    data-testid={`nav-${item.id}`}
                    className={`nav-pill ${isActive ? "nav-pill-active" : ""}`}
                  >
                    <span className="nav-pill-icon">
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="nav-pill-label hidden md:inline">{item.label}</span>
                    {showBadge && (
                      <span className="ml-1 text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-medium" data-testid="badge-saved-count">
                        {savedCount}
                      </span>
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{item.label}</p>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-2 text-sm text-muted-foreground">
            <span>{username}</span>
            <span className="text-xs bg-primary/10 px-2 py-0.5 rounded-full">{userRole}</span>
          </div>
          <ThemeToggle />
          <button
            onClick={onLogout}
            data-testid="button-logout"
            className="logout-btn-premium flex items-center gap-1"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}
