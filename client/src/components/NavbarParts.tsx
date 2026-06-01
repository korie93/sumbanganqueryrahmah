import type { RefObject } from "react";
import { ChevronDown } from "lucide-react";
import { HOME_NAV_ITEM } from "@/app/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { NavbarHomeButton } from "@/components/NavbarHomeButton";
import { NavbarUserMenuContent } from "@/components/NavbarUserMenuContent";
import type { AppTheme } from "@/components/useTheme";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavbarBrandClusterProps = {
  activeNavigationItemId: string;
  onNavigate: (itemId: string) => void;
  onPrefetch: (itemId: string) => void;
  showHomeButton: boolean;
  systemName?: string | undefined;
};

type NavbarUserMenuDropdownProps = {
  onCloseAutoFocus: (event: Event) => void;
  onEscapeKeyDown: (event: KeyboardEvent) => void;
  onLogout: () => void | Promise<void>;
  setTheme: (theme: AppTheme) => void;
  theme: AppTheme;
  triggerRef: RefObject<HTMLButtonElement>;
  userRole: string;
  username: string;
  variant: "desktop" | "mobile";
};

export function NavbarBrandCluster({
  activeNavigationItemId,
  onNavigate,
  onPrefetch,
  showHomeButton,
  systemName,
}: NavbarBrandClusterProps) {
  return (
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
          <p
            className="truncate text-sm font-semibold text-foreground"
            title={systemName || "SQR System"}
            aria-label={systemName || "SQR System"}
          >
            {systemName || "SQR System"}
          </p>
          <p className="hidden text-2xs text-muted-foreground sm:block">
            Ruang kerja operasi
          </p>
        </div>
      </div>

      {showHomeButton ? (
        <NavbarHomeButton
          active={activeNavigationItemId === HOME_NAV_ITEM.id}
          onNavigate={onNavigate}
          onPrefetch={onPrefetch}
        />
      ) : null}
    </div>
  );
}

export function NavbarUserMenuDropdown({
  onCloseAutoFocus,
  onEscapeKeyDown,
  onLogout,
  setTheme,
  theme,
  triggerRef,
  userRole,
  username,
  variant,
}: NavbarUserMenuDropdownProps) {
  const isMobile = variant === "mobile";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          className={isMobile ? "user-menu-trigger px-2.5 sm:px-3" : "user-menu-trigger max-w-[15rem] xl:max-w-none"}
          data-testid={isMobile ? "button-user-menu-mobile" : "button-user-menu"}
          aria-label={`Buka menu pengguna untuk ${username}`}
          aria-haspopup="menu"
        >
          <span className="user-menu-avatar" aria-hidden="true">
            {[...username][0] || ""}
          </span>
          {isMobile ? (
            <span className="hidden min-w-0 sm:flex sm:flex-col sm:items-start sm:leading-tight">
              <span className="truncate text-xs font-medium text-foreground" title={username} aria-label={username}>
                {username}
              </span>
              <span className="truncate text-2xs text-muted-foreground" title={userRole} aria-label={userRole}>
                {userRole}
              </span>
            </span>
          ) : (
            <span className="user-menu-copy max-w-[10.5rem] xl:max-w-none">
              <span className="truncate font-medium text-foreground" title={username} aria-label={username}>
                {username}
              </span>
              <span className="user-menu-role">{userRole}</span>
            </span>
          )}
          <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <NavbarUserMenuContent
        username={username}
        userRole={userRole}
        theme={theme}
        setTheme={setTheme}
        onLogout={onLogout}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={onEscapeKeyDown}
      />
    </DropdownMenu>
  );
}
