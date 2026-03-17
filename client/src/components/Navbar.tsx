import { memo, useCallback, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, LogOut, ShieldCheck } from "lucide-react";
import { formatNavigationLabel, getVisibleNavItems } from "@/app/navigation";
import type { TabVisibility } from "@/app/types";
import ThemeToggle from "./ThemeToggle";

interface NavbarProps {
  currentPage: string;
  onNavigate: (page: string, importId?: string) => void;
  onLogout: () => void | Promise<void>;
  userRole: string;
  username: string;
  systemName?: string;
  savedCount?: number;
  tabVisibility?: TabVisibility;
  featureLockdown?: boolean;
}

function NavbarImpl({
  currentPage,
  onNavigate,
  onLogout,
  userRole,
  username,
  systemName,
  savedCount,
  tabVisibility,
  featureLockdown = false,
}: NavbarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const visibleItems = useMemo(
    () => getVisibleNavItems(userRole, tabVisibility ?? null, featureLockdown),
    [featureLockdown, tabVisibility, userRole],
  );
  const mobileValue = visibleItems.some((item) => item.id === currentPage)
    ? currentPage
    : (visibleItems[0]?.id || "");

  const toggleCollapse = useCallback(() => setCollapsed((prev) => !prev), []);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className={`mx-auto flex min-h-14 max-w-[1440px] items-center gap-3 px-3 py-2 md:px-4 ${collapsed ? "navbar-collapsed" : ""}`}>
        <div className="flex min-w-0 shrink-0 items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card/75 px-2.5 py-1.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            {!collapsed ? (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{systemName || "SQR System"}</p>
                <p className="hidden text-[11px] text-muted-foreground sm:block">Operational workspace</p>
              </div>
            ) : null}
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 lg:flex lg:items-center lg:gap-1">
          <nav className="navbar-premium-glass w-full justify-start xl:justify-center">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              const showBadge = item.id === "saved" && savedCount !== undefined && savedCount > 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => onNavigate(item.id)}
                  data-testid={`nav-${item.id}`}
                  className={`nav-pill ${isActive ? "nav-pill-active" : ""}`}
                >
                  <span className="nav-pill-icon">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="nav-pill-label hidden xl:inline">{item.label}</span>
                  {showBadge ? (
                    <span
                      className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground"
                      data-testid="badge-saved-count"
                    >
                      {savedCount > 99 ? "99+" : savedCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
          <button
            type="button"
            onClick={toggleCollapse}
            className="nav-collapse-btn"
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            data-testid="button-toggle-navbar"
          >
            {collapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
          </button>
        </div>

        <div className="min-w-0 flex-1 lg:hidden">
          <label htmlFor="app-nav-select" className="sr-only">Navigate</label>
          <select
            id="app-nav-select"
            value={mobileValue}
            onChange={(event) => onNavigate(event.target.value)}
            className="app-nav-select"
          >
            {visibleItems.map((item) => (
              <option key={item.id} value={item.id}>
                {formatNavigationLabel(item.label, item.id, savedCount)}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          {!collapsed ? (
            <div className="hidden items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1 text-sm text-muted-foreground xl:flex">
              <span className="font-medium text-foreground">{username}</span>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">{userRole}</span>
            </div>
          ) : null}
          <ThemeToggle />
          <button
            type="button"
            onClick={() => {
              void onLogout();
            }}
            data-testid="button-logout"
            className="logout-btn-premium inline-flex items-center gap-1.5"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}

export default memo(NavbarImpl);
