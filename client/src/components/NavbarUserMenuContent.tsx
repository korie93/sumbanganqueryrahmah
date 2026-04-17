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
}

export function NavbarUserMenuContent({
  username,
  userRole,
  theme,
  setTheme,
  onLogout,
}: NavbarUserMenuContentProps) {
  return (
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
