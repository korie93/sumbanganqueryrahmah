import type { ReactNode, RefObject } from "react";
import { MoreHorizontal } from "lucide-react";
import { HOME_NAV_ITEM } from "@/app/navigation";
import { BrandLogo } from "@/components/BrandLogo";
import { NavbarHomeButton } from "@/components/NavbarHomeButton";
import { NavbarUserMenuContent } from "@/components/NavbarUserMenuContent";
import { DropdownMenu, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { getAriaExpandedProps } from "@/lib/aria-state-props";
import { AccountAvatar } from "@/components/AccountAvatar";

type NavbarBrandClusterProps = {
  activeNavigationItemId: string;
  onNavigate: (itemId: string) => void;
  onPrefetch: (itemId: string) => void;
  showHomeButton: boolean;
  systemName?: string | undefined;
  collapsed?: boolean | undefined;
  collapseControl: ReactNode;
};

export function NavbarBrandCluster({ activeNavigationItemId, onNavigate, onPrefetch, showHomeButton, systemName, collapsed = false, collapseControl }: NavbarBrandClusterProps) {
  return (
    <div className="workspace-brand-cluster">
      <div className="workspace-brand">
        <div className="workspace-brand-mark"><BrandLogo decorative priority className="block h-5 w-5" imageClassName="h-full w-full" /></div>
        <div className="workspace-brand-copy min-w-0">
          <p className="truncate text-sm font-semibold text-foreground" title={systemName || "SQR System"} aria-label={systemName || "SQR System"}>{systemName || "SQR System"}</p>
          <p className="text-xs text-muted-foreground">Operations workspace</p>
        </div>
        {collapseControl}
      </div>
      {showHomeButton ? <NavbarHomeButton active={activeNavigationItemId === HOME_NAV_ITEM.id} onNavigate={onNavigate} onPrefetch={onPrefetch} collapsed={collapsed} /> : null}
    </div>
  );
}

type NavbarUserMenuDropdownProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogout: () => void | Promise<void>;
  onAccount: () => void;
  onSecurity: () => void;
  onSettings: () => void;
  canAccessSettings: boolean;
  avatarUrl?: string | null | undefined;
  triggerRef: RefObject<HTMLButtonElement>;
  userRole: string;
  username: string;
  variant: "desktop" | "mobile";
  collapsed?: boolean | undefined;
  onCloseAutoFocus?: ((event: Event) => void) | undefined;
};

/** Shared accessible personal menu, anchored to the current account's profile row. */
export function NavbarUserMenuDropdown({ open, onOpenChange, onLogout, onAccount, onSecurity, onSettings, canAccessSettings, avatarUrl, triggerRef, userRole, username, variant, collapsed = false, onCloseAutoFocus }: NavbarUserMenuDropdownProps) {
  return (
    <DropdownMenu modal={false} open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger asChild>
        <button ref={triggerRef} type="button" className="user-menu-trigger workspace-sidebar-profile"
          data-testid={variant === "mobile" ? "button-user-menu-mobile" : "button-user-menu"}
          aria-label={`Open profile menu for ${username}`} aria-haspopup="menu" {...getAriaExpandedProps(open)}>
          <AccountAvatar username={username} avatarUrl={avatarUrl} className="user-menu-avatar" />
          {!collapsed ? <>
            <span className="user-menu-copy">
              <span className="truncate font-medium text-foreground" title={username} aria-label={username}>{username}</span>
              <span className="user-menu-role">{userRole}</span>
            </span>
            <MoreHorizontal className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          </> : null}
        </button>
      </DropdownMenuTrigger>
      <NavbarUserMenuContent username={username} userRole={userRole} avatarUrl={avatarUrl} variant={variant} onLogout={onLogout} onAccount={onAccount} onSecurity={onSecurity} onSettings={onSettings} canAccessSettings={canAccessSettings} onCloseAutoFocus={onCloseAutoFocus} />
    </DropdownMenu>
  );
}
