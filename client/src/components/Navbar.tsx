import { memo, useMemo } from "react";
import {
  ChevronDown,
  Home,
  LogOut,
  Menu,
  Moon,
  ShieldCheck,
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
  formatNavigationLabel,
  getVisibleNavItems,
  getVisibleNavigationGroups,
  getVisiblePrimaryNavItems,
  HOME_NAV_ITEM,
  isNavigationGroupActive,
  isNavigationItemActive,
  resolveNavigationTarget,
} from "@/app/navigation";
import type { TabVisibility } from "@/app/types";
import { useTheme } from "@/components/useTheme";

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
  const { theme, setTheme } = useTheme();
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
  const activeMobileItemId = mobileItems.find((item) => isNavigationItemActive(currentPage, item.id))?.id
    || mobileItems[0]?.id
    || HOME_NAV_ITEM.id;

  const navigateToItem = (itemId: string) => {
    onNavigate(resolveNavigationTarget(itemId));
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border/70 bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex min-h-16 max-w-[1440px] items-center gap-3 px-3 py-2 md:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-border/70 bg-card/75 px-2.5 py-1.5 shadow-sm">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <ShieldCheck className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{systemName || "SQR System"}</p>
              <p className="hidden text-[11px] text-muted-foreground sm:block">Operational workspace</p>
            </div>
          </div>

          {showHomeButton ? (
            <button
              type="button"
              onClick={() => navigateToItem(HOME_NAV_ITEM.id)}
              className={`nav-pill nav-home-pill hidden lg:inline-flex ${isNavigationItemActive(currentPage, HOME_NAV_ITEM.id) ? "nav-pill-active" : ""}`}
              data-testid="nav-home"
            >
              <span className="nav-pill-icon">
                <Home className="h-4 w-4" />
              </span>
              <span className="nav-pill-label">Home</span>
            </button>
          ) : null}
        </div>

        <div className="hidden min-w-0 flex-1 items-center justify-center gap-2 lg:flex">
          <nav className="navbar-premium-glass max-w-full">
            {directItems.map((item) => {
              const Icon = item.icon;
              const isActive = isNavigationItemActive(currentPage, item.id);
              const showBadge = item.id === "saved" && savedCount !== undefined && savedCount > 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  title={item.label}
                  aria-label={item.label}
                  onClick={() => navigateToItem(item.id)}
                  data-testid={`nav-${item.id}`}
                  className={`nav-pill ${isActive ? "nav-pill-active" : ""}`}
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
              const active = isNavigationGroupActive(currentPage, group);
              return (
                <DropdownMenu key={group.id}>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
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
                        const activeItem = isNavigationItemActive(currentPage, item.id);
                        return (
                          <DropdownMenuItem
                            key={item.id}
                            onSelect={() => navigateToItem(item.id)}
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
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="lg:hidden">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="nav-mobile-trigger"
                  aria-label="Open navigation menu"
                  data-testid="button-open-mobile-nav"
                >
                  <Menu className="h-4 w-4" />
                  <span className="hidden sm:inline">Menu</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 p-2">
                <DropdownMenuLabel className="px-2 pb-2 pt-1">
                  <div className="text-sm font-semibold">Navigate</div>
                  <div className="mt-1 text-xs font-normal text-muted-foreground">
                    Current section: {formatNavigationLabel(
                      mobileItems.find((item) => item.id === activeMobileItemId)?.label || "Home",
                      activeMobileItemId,
                      savedCount,
                    )}
                  </div>
                </DropdownMenuLabel>
                {mobileItems.map((item) => {
                  const Icon = item.icon;
                  const active = isNavigationItemActive(currentPage, item.id);
                  return (
                    <DropdownMenuItem
                      key={item.id}
                      onSelect={() => navigateToItem(item.id)}
                      className={`items-center gap-3 rounded-xl px-3 py-3 ${active ? "bg-accent text-accent-foreground" : ""}`}
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="flex-1 text-sm font-medium">
                        {formatNavigationLabel(item.label, item.id, savedCount)}
                      </span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="user-menu-trigger"
                data-testid="button-user-menu"
                aria-label="Open user menu"
              >
                <span className="user-menu-copy">
                  <span className="truncate font-medium text-foreground">{username}</span>
                  <span className="user-menu-role">{userRole}</span>
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 p-2">
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
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

export default memo(NavbarImpl);
