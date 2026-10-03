import { useEffect, useRef, useState } from "react";
import { Moon, PanelLeftClose, PanelLeftOpen, Search, Sun } from "lucide-react";
import type { NavigationEntry } from "@/app/navigation";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { LARGE_UP_MEDIA_QUERY } from "@/lib/responsive";
import { getAriaExpandedProps } from "@/lib/aria-state-props";
import { commandModuleKeywords, isCommandSearchShortcut } from "./navbar-command-utils";
import "./NavbarCommandSearch.css";

type NavbarCommandSearchProps = {
  items: NavigationEntry[];
  desktop: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (itemId: string) => void;
  theme: string;
  onToggleTheme: () => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
};

/** Renders permission-filtered workspace search without mounting a hidden mobile overlay. */
export function NavbarCommandSearch({
  items, desktop, open, onOpenChange, onNavigate, theme, onToggleTheme, sidebarCollapsed, onToggleSidebar,
}: NavbarCommandSearchProps) {
  const [query, setQuery] = useState("");
  const desktopRoot = useRef<HTMLDivElement>(null);
  const desktopInput = useRef<HTMLInputElement>(null);
  const mobileTrigger = useRef<HTMLButtonElement>(null);
  const restoringFocus = useRef(false);

  useEffect(() => {
    if (!open) { setQuery(""); return; }
    if (desktop) desktopInput.current?.focus({ preventScroll: true });
  }, [desktop, open]);

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const editing = Boolean(target?.closest("input,textarea,select,[contenteditable]:not([contenteditable='false']),[role='textbox']"));
      const otherDialog = Array.from(document.querySelectorAll("[role='dialog'][data-state='open']"))
        .some((element) => element.id !== "command-search-dialog");
      if (isCommandSearchShortcut(event, editing, otherDialog)) {
        event.preventDefault();
        onOpenChange(!open);
      } else if (desktop && open && event.key === "Escape") {
        event.preventDefault();
        onOpenChange(false);
        desktopInput.current?.focus({ preventScroll: true });
      }
    };
    window.addEventListener("keydown", keyboard);
    return () => window.removeEventListener("keydown", keyboard);
  }, [desktop, onOpenChange, open]);

  useEffect(() => {
    if (!desktop || !open) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !desktopRoot.current?.contains(event.target)) onOpenChange(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [desktop, onOpenChange, open]);

  const choose = (action: () => void) => {
    onOpenChange(false);
    setQuery("");
    action();
  };
  const themeLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";
  const ThemeIcon = theme === "dark" ? Sun : Moon;
  const sidebarLabel = sidebarCollapsed ? "Expand navigation" : "Collapse navigation";
  const SidebarIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose;
  const results = (
    <CommandList className="workspace-command-results" aria-label="Authorized modules and actions" onMouseDown={(event) => event.preventDefault()}>
      <CommandEmpty>No matching modules or actions.</CommandEmpty>
      <CommandGroup heading="Modules">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <CommandItem
              key={item.id}
              value={`module:${item.id}`}
              keywords={commandModuleKeywords(item)}
              onSelect={() => choose(() => onNavigate(item.id))}
              data-testid={`command-module-${item.id}`}
            >
              <Icon aria-hidden="true" />
              <span className="min-w-0"><span className="block font-medium">{item.title || item.label}</span>
                {item.description ? <span className="block text-xs text-muted-foreground">{item.description}</span> : null}
              </span>
            </CommandItem>
          );
        })}
      </CommandGroup>
      <CommandGroup heading="Actions">
        <CommandItem value="theme" keywords={[themeLabel, "appearance"]} onSelect={() => choose(onToggleTheme)}>
          <ThemeIcon aria-hidden="true" />{themeLabel}
        </CommandItem>
        {desktop ? (
          <CommandItem value="sidebar" keywords={[sidebarLabel]} onSelect={() => choose(onToggleSidebar)}>
            <SidebarIcon aria-hidden="true" />{sidebarLabel}
          </CommandItem>
        ) : null}
      </CommandGroup>
    </CommandList>
  );

  return (
    <>
      {desktop ? (
        <div
          className="workspace-command-desktop"
          ref={desktopRoot}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) onOpenChange(false);
          }}
        >
          <Command loop label="Search modules or actions" className="workspace-command-inline">
            <CommandInput
              asChild
              ref={desktopInput}
              value={query}
              onValueChange={(value) => { setQuery(value); onOpenChange(true); }}
              onFocus={() => { if (!restoringFocus.current) onOpenChange(true); }}
              onClick={() => onOpenChange(true)}
              onKeyDown={(event) => {
                if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) onOpenChange(true);
              }}
              placeholder="Search module or action…"
              aria-label="Search module or action"
              data-testid="input-quick-search"
            >
              {/* cmdk assumes its list is always mounted. The slot keeps its keyboard
                  wiring but describes this inline popup's real mounted state. */}
              <input
                {...getAriaExpandedProps(open)}
                {...(!open ? { "aria-controls": undefined, "aria-activedescendant": undefined } : {})}
              />
            </CommandInput>
            <kbd className="workspace-command-shortcut" aria-hidden="true">Ctrl K</kbd>
            {open ? <div className="workspace-command-popup">{results}</div> : null}
          </Command>
        </div>
      ) : (
        <button
          ref={mobileTrigger}
          type="button"
          className="workspace-command-mobile-trigger"
          aria-label="Search modules"
          aria-haspopup="dialog"
          {...getAriaExpandedProps(open)}
          aria-controls={open ? "command-search-dialog" : undefined}
          onClick={() => onOpenChange(true)}
          data-testid="button-command-search-mobile"
        ><Search className="h-4 w-4" aria-hidden="true" /></button>
      )}
      {!desktop && open ? (
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent
            id="command-search-dialog"
            data-testid="command-search-dialog"
            className="workspace-command-sheet"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              // A breakpoint change unmounts the mobile dialog. Restore visible
              // focus without the inline input reopening the just-closed search.
              restoringFocus.current = true;
              try {
                if (window.matchMedia(LARGE_UP_MEDIA_QUERY).matches) desktopInput.current?.focus({ preventScroll: true });
                else mobileTrigger.current?.focus({ preventScroll: true });
              } finally { restoringFocus.current = false; }
            }}
          >
            <DialogTitle className="px-4 pt-4 text-base">Search workspace</DialogTitle>
            <DialogDescription className="sr-only">Find an authorized module or change the display.</DialogDescription>
            <Command loop label="Search modules or actions">
              <CommandInput value={query} onValueChange={setQuery} placeholder="Search module or action…" aria-label="Search module or action" data-testid="input-command-search" />
              {results}
            </Command>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
