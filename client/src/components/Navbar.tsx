import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  Home,
  LogOut,
  Menu,
  Moon,
  Sun,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  formatNavigationLabel,
  getVisibleNavItems,
  getVisibleNavigationGroups,
  getVisiblePrimaryNavItems,
  HOME_NAV_ITEM,
  resolveNavigationTarget,
  resolveActiveNavigationItemId,
} from "@/app/navigation";
import { prefetchNavigationTarget } from "@/app/navigation-prefetch";
import type { MonitorSection, TabVisibility } from "@/app/types";
import { BrandLogo } from "@/components/BrandLogo";
import { useTheme } from "@/components/useTheme";
import { cn } from "@/lib/utils";
import "./Navbar.css";

interface NavbarProps {
  currentPage: string;
  onNavigate: (page: string, importId?: string) => void;
  onLogout: () => void | Promise<void>;
  userRole: string;
  username: string;
  systemName?: string | undefined;
  savedCount?: number | undefined;
  tabVisibility?: TabVisibility | undefined;
  featureLockdown?: boolean | undefined;
  monitorSection?: MonitorSection | undefined;
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
  monitorSection,
}: NavbarProps) {
  const { theme, setTheme } = useTheme();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const navScrollerRef = useRef<HTMLElement | null>(null);
  const [desktopNavOverflow, setDesktopNavOverflow] = useState({
    canScroll: false,
    canScrollLeft: false,
    canScrollRight: false,
  });
  const directItems = useMemo(
    () => getVisiblePrimaryNavItems(userRole, tabVisibility ?? null, featureLockdown),
    [featureLockdown, tabVisibility, userRole],
  );
  const groupedItems = useMemo(
    () => getVisibleNavigationGroups(userRole, tabVisibility ?? null, featureLockdown),
    [featureLockdown, tabVisibility, userRole],
  );
  const mobileItems = useMemo(
    () => getVisibleNavItems(userRole, tabVisibility ?? null, featureLockdown),
    [featureLockdown, tabVisibility, userRole],
  );
  const showHomeButton = mobileItems.some((item) => item.id === HOME_NAV_ITEM.id);
  const activeNavigationItemId = resolveActiveNavigationItemId(currentPage, {
    monitorSection,
    pathname: typeof window !== "undefined" ? window.location.pathname : "",
    search: typeof window !== "undefined" ? window.location.search : "",
  });
  const activeMobileItemId = mobileItems.find((item) => item.id === activeNavigationItemId)?.id
    || mobileItems[0]?.id
    || HOME_NAV_ITEM.id;

  const navigateToItem = (itemId: string) => {
    onNavigate(resolveNavigationTarget(itemId));
  };
  const prefetchItem = useCallback((itemId: string) => {
    void prefetchNavigationTarget(resolveNavigationTarget(itemId));
  }, []);

  useEffect(() => {
    const navNode = navScrollerRef.current;

    if (!navNode || typeof window === "undefined") {
      return;
    }

    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;

    const updateOverflowState = () => {
      frame = 0;

      const maxScrollLeft = Math.max(0, navNode.scrollWidth - navNode.clientWidth);
      const nextState = {
        canScroll: maxScrollLeft > 12,
        canScrollLeft: navNode.scrollLeft > 8,
        canScrollRight: maxScrollLeft - navNode.scrollLeft > 8,
      };

      setDesktopNavOverflow((previous) => (
        previous.canScroll === nextState.canScroll
        && previous.canScrollLeft === nextState.canScrollLeft
        && previous.canScrollRight === nextState.canScrollRight
      ) ? previous : nextState);
    };

    const scheduleOverflowUpdate = () => {
      if (frame !== 0) {
        return;
      }

      frame = window.requestAnimationFrame(updateOverflowState);
    };

    scheduleOverflowUpdate();
    navNode.addEventListener("scroll", scheduleOverflowUpdate, { passive: true });
    window.addEventListener("resize", scheduleOverflowUpdate);

    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(() => {
        scheduleOverflowUpdate();
      });
      resizeObserver.observe(navNode);
    }

    return () => {
      navNode.removeEventListener("scroll", scheduleOverflowUpdate);
      window.removeEventListener("resize", scheduleOverflowUpdate);
      resizeObserver?.disconnect();

      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [directItems, groupedItems, savedCount, showHomeButton]);

  const renderUserMenuContent = () => (
    <DropdownMenuContent
      align="end"
      className="w-[min(18rem,calc(100vw-1rem))] rounded-xl p-2"
    >
      <DropdownMenuLabel className="px-2 pb-2 pt-1">
        <div className="text-sm font-semibold">{username}</div>
        <div className="mt-1 text-xs font-normal text-muted-foreground">
          Signed in as {userRole}
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="px-2 pb-1 pt-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">
        Appearance
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value === "dark" ? "dark" : "light")}>
        <DropdownMenuRadioItem value="light" className="rounded-lg px-3 py-2.5">
          <Sun className="h-4 w-4" />
          <span>Light Mode</span>
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark" className="rounded-lg px-3 py-2.5">
          <Moon className="h-4 w-4" />
          <span>Dark Mode</span>
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={() => {
          void onLogout();
        }}
        className="rounded-lg px-3 py-2.5 text-destructive focus:text-destructive"
        data-testid="button-logout"
      >
        <LogOut className="h-4 w-4" />
        <span>Logout</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );

  return (
    <header className="navbar-safe-area-shell sticky top-0 z-[var(--z-navbar)] w-full border-b border-border/70 bg-background/95 supports-[backdrop-filter]:bg-background/90 supports-[backdrop-filter]:backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-3 py-2 md:px-4 lg:min-h-16 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-start justify-between gap-3 lg:flex-[0_1_auto] lg:items-center lg:pr-2">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex min-w-0 items-center gap-2 rounded-full border border-border/70 bg-card/75 px-2.5 py-1.5 shadow-sm lg:max-w-[17rem] xl:max-w-none">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/10">
                <BrandLogo
                  decorative
                  priority
                  className="block h-5 w-5"
                  imageClassName="h-full w-full"
                />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{systemName || "SQR System"}</p>
                <p className="hidden text-[11px] text-muted-foreground sm:block">Operational workspace</p>
              </div>
            </div>

            {showHomeButton ? (
              activeNavigationItemId === HOME_NAV_ITEM.id ? (
                <button
                  type="button"
                  onClick={() => navigateToItem(HOME_NAV_ITEM.id)}
                  onMouseEnter={() => prefetchItem(HOME_NAV_ITEM.id)}
                  onFocus={() => prefetchItem(HOME_NAV_ITEM.id)}
                  className="nav-pill nav-home-pill nav-pill-active hidden lg:inline-flex"
                  data-testid="nav-home"
                  aria-label={HOME_NAV_ITEM.label}
                  aria-current="page"
                >
                  <span className="nav-pill-icon">
                    <Home className="h-4 w-4" />
                  </span>
                  <span className="nav-pill-label">Home</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => navigateToItem(HOME_NAV_ITEM.id)}
                  onMouseEnter={() => prefetchItem(HOME_NAV_ITEM.id)}
                  onFocus={() => prefetchItem(HOME_NAV_ITEM.id)}
                  className="nav-pill nav-home-pill hidden lg:inline-flex"
                  data-testid="nav-home"
                  aria-label={HOME_NAV_ITEM.label}
                >
                  <span className="nav-pill-icon">
                    <Home className="h-4 w-4" />
                  </span>
                  <span className="nav-pill-label">Home</span>
                </button>
              )
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2 lg:hidden">
            <button
              type="button"
              className="nav-mobile-trigger px-3"
              aria-label="Open navigation menu"
              aria-haspopup="dialog"
              aria-controls="mobile-navigation-drawer"
              onClick={() => setMobileNavOpen(true)}
              data-testid="button-open-mobile-nav"
            >
              <Menu className="h-4 w-4" />
              <span className="hidden sm:inline">Menu</span>
            </button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="user-menu-trigger px-2.5 sm:px-3"
                  data-testid="button-user-menu-mobile"
                  aria-label="Open user menu"
                  aria-haspopup="menu"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold uppercase text-primary">
                    {username.slice(0, 1)}
                  </span>
                  <span className="hidden min-w-0 sm:flex sm:flex-col sm:items-start sm:leading-tight">
                    <span className="truncate text-xs font-medium text-foreground">{username}</span>
                    <span className="truncate text-[11px] text-muted-foreground">{userRole}</span>
                  </span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              {renderUserMenuContent()}
            </DropdownMenu>
          </div>
        </div>

        <div className="navbar-nav-shell hidden min-w-0 flex-1 items-center justify-start overflow-hidden lg:flex">
          <nav
            ref={navScrollerRef}
            className="navbar-premium-glass w-full justify-start"
            aria-label="Primary navigation"
          >
            {directItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeNavigationItemId === item.id;
              const showBadge = item.id === "saved" && savedCount !== undefined && savedCount > 0;
              return isActive ? (
                <button
                  key={item.id}
                  type="button"
                  title={item.label}
                  aria-label={item.label}
                  aria-current="page"
                  onClick={() => navigateToItem(item.id)}
                  onMouseEnter={() => prefetchItem(item.id)}
                  onFocus={() => prefetchItem(item.id)}
                  data-testid={`nav-${item.id}`}
                  className="nav-pill nav-pill-active"
                >
                  <span className="nav-pill-icon">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="nav-pill-label">{item.label}</span>
                  {showBadge ? (
                    <span
                      className="rounded-full bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground"
                      data-testid="badge-saved-count"
                    >
                      {savedCount > 99 ? "99+" : savedCount}
                    </span>
                  ) : null}
                </button>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => navigateToItem(item.id)}
                  onMouseEnter={() => prefetchItem(item.id)}
                  onFocus={() => prefetchItem(item.id)}
                  data-testid={`nav-${item.id}`}
                  className="nav-pill"
                >
                  <span className="nav-pill-icon">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="nav-pill-label">{item.label}</span>
                  {showBadge ? (
                    <span
                      className="rounded-full bg-primary px-1.5 py-0.5 text-xs font-medium text-primary-foreground"
                      data-testid="badge-saved-count"
                    >
                      {savedCount > 99 ? "99+" : savedCount}
                    </span>
                  ) : null}
                </button>
              );
            })}

            {groupedItems.map((group) => {
              const GroupIcon = group.icon;
              const active = group.items.some((item) => item.id === activeNavigationItemId);
              return (
                <DropdownMenu key={group.id}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      title={group.label}
                      aria-label={`${group.label} menu`}
                      onMouseEnter={() => group.items.forEach((item) => prefetchItem(item.id))}
                      onFocus={() => group.items.forEach((item) => prefetchItem(item.id))}
                      className={`nav-pill ${active ? "nav-pill-active" : ""}`}
                      data-testid={`nav-group-${group.id}`}
                    >
                      <span className="nav-pill-icon">
                        <GroupIcon className="h-4 w-4" />
                      </span>
                      <span className="nav-pill-label">{group.label}</span>
                      <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="center" className="w-80 p-2">
                    <DropdownMenuLabel className="px-2 pb-2 pt-1">
                      <div className="text-sm font-semibold">{group.label}</div>
                      <div className="mt-1 text-xs font-normal text-muted-foreground">
                        {group.description}
                      </div>
                    </DropdownMenuLabel>
                    <DropdownMenuGroup>
                      {group.items.map((item) => {
                        const Icon = item.icon;
                        const activeItem = activeNavigationItemId === item.id;
                        return (
                          <DropdownMenuItem
                            key={item.id}
                            onSelect={() => navigateToItem(item.id)}
                            onFocus={() => prefetchItem(item.id)}
                            className={`items-start gap-3 rounded-xl px-3 py-3 ${activeItem ? "bg-accent text-accent-foreground" : ""}`}
                          >
                            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              <Icon className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 space-y-0.5">
                              <span className="block text-sm font-medium leading-none">{item.label}</span>
                              {item.description ? (
                                <span className="block text-xs leading-relaxed text-muted-foreground">
                                  {item.description}
                                </span>
                              ) : null}
                            </span>
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </nav>
          {desktopNavOverflow.canScroll ? (
            <>
              <div
                className={cn(
                  "navbar-scroll-fade navbar-scroll-fade--left",
                  desktopNavOverflow.canScrollLeft ? "navbar-scroll-fade--visible" : "",
                )}
                aria-hidden="true"
              />
              <div
                className={cn(
                  "navbar-scroll-fade navbar-scroll-fade--right",
                  desktopNavOverflow.canScrollRight ? "navbar-scroll-fade--visible" : "",
                )}
                aria-hidden="true"
              />
              {desktopNavOverflow.canScrollRight ? (
                <div className="navbar-scroll-hint" aria-hidden="true">
                  Scroll for more
                </div>
              ) : null}
            </>
          ) : null}
        </div>

        <div className="ml-auto hidden shrink-0 items-center gap-2 lg:flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="user-menu-trigger max-w-[15rem] xl:max-w-none"
                data-testid="button-user-menu"
                aria-label="Open user menu"
                aria-haspopup="menu"
              >
                <span className="user-menu-copy max-w-[10.5rem] xl:max-w-none">
                  <span className="truncate font-medium text-foreground">{username}</span>
                  <span className="user-menu-role">{userRole}</span>
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            {renderUserMenuContent()}
          </DropdownMenu>
        </div>
      </div>

      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent
          id="mobile-navigation-drawer"
          side="left"
          className="w-[min(92vw,22rem)]"
        >
          <SheetHeader className="pr-8 text-left">
            <SheetTitle>Navigation</SheetTitle>
            <SheetDescription>
              Current section: {formatNavigationLabel(
                mobileItems.find((item) => item.id === activeMobileItemId)?.label || "Home",
                activeMobileItemId,
                savedCount,
              )}
            </SheetDescription>
          </SheetHeader>

          <nav className="mt-4 space-y-2" aria-label="Mobile navigation">
            {mobileItems.map((item) => {
              const Icon = item.icon;
              const active = item.id === activeMobileItemId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    navigateToItem(item.id);
                    setMobileNavOpen(false);
                  }}
                  onMouseEnter={() => prefetchItem(item.id)}
                  onFocus={() => prefetchItem(item.id)}
                  className={`flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${
                    active
                      ? "border-primary/35 bg-primary/10 text-primary"
                      : "border-border/60 bg-background/70 text-foreground hover:bg-accent/40"
                  }`}
                >
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {formatNavigationLabel(item.label, item.id, savedCount)}
                    </span>
                    {item.description ? (
                      <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </header>
  );
}

export default memo(NavbarImpl);
