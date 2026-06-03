import { LogOut, Moon, Sun } from "lucide-react"

import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

type NavbarUserMenuContentProps = {
  username: string
  userRole: string
  theme: string
  setTheme: (theme: "light" | "dark") => void
  onLogout: () => void | Promise<void>
  onCloseAutoFocus?: (event: Event) => void
  onEscapeKeyDown?: (event: KeyboardEvent) => void
}

/**
 * Renders the navbar user menu content surface with standard SQR layout behavior.
 */
export function NavbarUserMenuContent({
  username,
  userRole,
  theme,
  setTheme,
  onLogout,
  onCloseAutoFocus,
  onEscapeKeyDown,
}: NavbarUserMenuContentProps) {
  return (
    <DropdownMenuContent
      align="end"
      className="navbar-dropdown-content w-[min(18rem,calc(100vw-1rem))] rounded-xl p-2"
      onCloseAutoFocus={onCloseAutoFocus}
      onEscapeKeyDown={onEscapeKeyDown}
    >
      <DropdownMenuLabel className="rounded-xl border border-border/60 bg-muted/20 p-3">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-sm font-semibold uppercase text-primary"
            aria-hidden="true"
          >
            {[...username][0] || ""}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold">{username}</span>
            <span className="mt-1 inline-flex rounded-full bg-primary/10 px-2 py-0.5 text-2xs font-semibold uppercase tracking-label-xs text-primary">
              {userRole}
            </span>
          </span>
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuLabel className="px-2 pb-1 pt-2 text-xs uppercase tracking-label-lg text-muted-foreground">
        Appearance
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={theme}
        onValueChange={(value) => setTheme(value === "dark" ? "dark" : "light")}
      >
        <DropdownMenuRadioItem value="light" className="rounded-lg px-3 py-2.5">
          <Sun className="h-4 w-4" aria-hidden="true" />
          <span>Light Mode</span>
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="dark" className="rounded-lg px-3 py-2.5">
          <Moon className="h-4 w-4" aria-hidden="true" />
          <span>Dark Mode</span>
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={() => {
          void onLogout()
        }}
        className="rounded-lg px-3 py-2.5 text-destructive focus:text-destructive"
        data-testid="button-logout"
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        <span>Logout</span>
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}
