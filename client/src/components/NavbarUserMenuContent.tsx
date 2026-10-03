import { LogOut, Settings, ShieldCheck, UserRound } from "lucide-react";
import { AccountAvatar } from "@/components/AccountAvatar";
import { DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";

type NavbarUserMenuContentProps = {
  username: string;
  userRole: string;
  canAccessSettings: boolean;
  avatarUrl?: string | null | undefined;
  onAccount: () => void;
  onSecurity: () => void;
  onSettings: () => void;
  onLogout: () => void | Promise<void>;
  variant: "desktop" | "mobile";
  onCloseAutoFocus?: ((event: Event) => void) | undefined;
};

/** Existing account security and logout actions anchored to the sidebar profile. */
export function NavbarUserMenuContent({ username, userRole, canAccessSettings, avatarUrl, onAccount, onSecurity, onSettings, onLogout, variant, onCloseAutoFocus }: NavbarUserMenuContentProps) {
  return (
    <DropdownMenuContent side={variant === "desktop" ? "right" : "top"} align="end" sideOffset={16} collisionPadding={12}
      className="navbar-dropdown-content workspace-profile-menu w-[min(17rem,calc(100vw-1.5rem))] p-2"
      onCloseAutoFocus={onCloseAutoFocus}>
      <DropdownMenuLabel className="min-w-0 px-3 py-2">
        <AccountAvatar username={username} avatarUrl={avatarUrl} className="mb-2 h-9 w-9" />
        <span className="block break-words">{username}</span>
        <span className="mt-1 block text-xs font-normal capitalize text-muted-foreground">{userRole}</span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onAccount} className="min-h-11 px-3"><UserRound aria-hidden="true" /><span>Account</span></DropdownMenuItem>
      <DropdownMenuItem onSelect={onSecurity} className="min-h-11 px-3"><ShieldCheck aria-hidden="true" /><span>Security</span></DropdownMenuItem>
      {canAccessSettings ? <DropdownMenuItem onSelect={onSettings} className="min-h-11 px-3"><Settings aria-hidden="true" /><span>Settings</span></DropdownMenuItem> : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => { void onLogout(); }} className="min-h-11 px-3 text-destructive focus:text-destructive" data-testid="button-logout">
        <LogOut aria-hidden="true" /><span>Logout</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
