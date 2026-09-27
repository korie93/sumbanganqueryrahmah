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
  collapsed?: boolean | undefined;
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
  collapsed = false,
}: NavbarBrandClusterProps) {
  return (
    <div className="workspace-brand-cluster">
      <div className="workspace-brand">
        <div className="workspace-brand-mark">
          <BrandLogo
            decorative
            priority
            className="block h-5 w-5"
            imageClassName="h-full w-full"
          />
        </div>
        <div className="workspace-brand-copy min-w-0">
          <p
            className="truncate text-sm font-semibold text-foreground"
            title={systemName || "SQR System"}
            aria-label={systemName || "SQR System"}
          >
            {systemName || "SQR System"}
          </p>
          <p className="text-xs text-muted-foreground">
            Ruang kerja operasi
          </p>
        </div>
      </div>

      {showHomeButton ? (
        <NavbarHomeButton
          active={activeNavigationItemId === HOME_NAV_ITEM.id}
          onNavigate={onNavigate}
          onPrefetch={onPrefetch}
          collapsed={collapsed}
        />
      ) : null}
    </div>
  );
}

/**
 * Renders the shared navbar user menu dropdown component used across SQR screens.
 */
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
          className={isMobile ? "user-menu-trigger user-menu-trigger-mobile" : "user-menu-trigger"}
          data-testid={isMobile ? "button-user-menu-mobile" : "button-user-menu"}
          aria-label={`Buka menu pengguna untuk ${username}`}
          aria-haspopup="menu"
        >
          <span className="user-menu-avatar" aria-hidden="true">
            {[...username][0] || ""}
          </span>
          {isMobile ? (
            <span className="hidden min-w-0 sm:flex sm:max-w-[10rem] sm:flex-col sm:items-start sm:leading-tight">
              <span className="truncate text-xs font-medium text-foreground" title={username} aria-label={username}>
                {username}
              </span>
              <span className="truncate text-2xs text-muted-foreground" title={userRole} aria-label={userRole}>
                {userRole}
              </span>
            </span>
          ) : (
            <span className="user-menu-copy">
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
