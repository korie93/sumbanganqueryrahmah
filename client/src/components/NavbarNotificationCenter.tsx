import {
  ArrowRight,
  Bell,
  BellOff,
  CircleAlert,
  CircleCheck,
  Info,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { useMemo, useState } from "react";

import {
  formatNotificationHistoryTimestamp,
  getNotificationHistoryPresentation,
} from "@/components/navbar-notification-utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type {
  NotificationHistoryEntry,
  NotificationHistoryState,
  NotificationHistoryVariant,
} from "@/hooks/use-notification-history";
import { cn } from "@/lib/utils";

type NavbarNotificationCenterProps = NotificationHistoryState & {
  onClear: () => void;
  onMarkRead: () => void;
  variant: "desktop" | "mobile";
};

const notificationIcons = {
  default: Bell,
  destructive: CircleAlert,
  info: Info,
  success: CircleCheck,
  warning: TriangleAlert,
} as const;

type NotificationHistoryFilter = "all" | "destructive" | "success" | "warning";
type NotificationFilterCounts = Record<NotificationHistoryFilter, number>;
type NotificationHistoryModuleGroup = {
  module: string;
  entries: NotificationHistoryEntry[];
};

const FALLBACK_NOTIFICATION_MODULE = "Sistem";

const notificationFilters: ReadonlyArray<{
  id: NotificationHistoryFilter;
  label: string;
  variants?: readonly NotificationHistoryVariant[];
}> = [
  { id: "all", label: "Semua" },
  { id: "destructive", label: "Ralat", variants: ["destructive"] },
  { id: "success", label: "Berjaya", variants: ["success"] },
  { id: "warning", label: "Perhatian", variants: ["warning"] },
];

function matchesNotificationFilter(
  entry: NotificationHistoryEntry,
  filter: NotificationHistoryFilter,
): boolean {
  const option = notificationFilters.find((item) => item.id === filter);
  return !option?.variants || option.variants.includes(entry.variant);
}

function getNotificationFilterCounts(entries: readonly NotificationHistoryEntry[]) {
  return notificationFilters.reduce<NotificationFilterCounts>(
    (counts, option) => {
      counts[option.id] = entries.filter((entry) =>
        matchesNotificationFilter(entry, option.id)).length;
      return counts;
    },
    {
      all: 0,
      destructive: 0,
      success: 0,
      warning: 0,
    },
  );
}

function getNotificationSeveritySummary(filterCounts: NotificationFilterCounts) {
  return [
    { id: "destructive", label: "Ralat", count: filterCounts.destructive },
    { id: "warning", label: "Perhatian", count: filterCounts.warning },
    { id: "success", label: "Berjaya", count: filterCounts.success },
  ] as const;
}

function getNotificationEntryModule(entry: NotificationHistoryEntry): string {
  return entry.module || FALLBACK_NOTIFICATION_MODULE;
}

function groupNotificationEntriesByModule(
  entries: readonly NotificationHistoryEntry[],
): NotificationHistoryModuleGroup[] {
  const groups: NotificationHistoryModuleGroup[] = [];
  const groupIndexByModule = new Map<string, number>();

  for (const entry of entries) {
    const module = getNotificationEntryModule(entry);
    const existingIndex = groupIndexByModule.get(module);

    if (existingIndex !== undefined) {
      groups[existingIndex]?.entries.push(entry);
      continue;
    }

    groupIndexByModule.set(module, groups.length);
    groups.push({ module, entries: [entry] });
  }

  return groups;
}

/**
 * Renders the bounded, session-only notification history from the navbar.
 */
export function NavbarNotificationCenter({
  entries,
  onClear,
  onMarkRead,
  unreadCount,
  variant,
}: NavbarNotificationCenterProps) {
  const [activeFilter, setActiveFilter] = useState<NotificationHistoryFilter>("all");
  const triggerLabel = unreadCount > 0
    ? `Buka pusat notifikasi, ${unreadCount} belum dibaca`
    : "Buka pusat notifikasi";
  const filterCounts = useMemo(() => getNotificationFilterCounts(entries), [entries]);
  const severitySummary = useMemo(
    () => getNotificationSeveritySummary(filterCounts),
    [filterCounts],
  );
  const visibleEntries = useMemo(
    () => entries.filter((entry) => matchesNotificationFilter(entry, activeFilter)),
    [activeFilter, entries],
  );
  const groupedVisibleEntries = useMemo(
    () => groupNotificationEntriesByModule(visibleEntries),
    [visibleEntries],
  );
  const filterPanelId = `notification-center-${variant}-panel`;
  const activeFilterTabId = `notification-center-${variant}-filter-${activeFilter}`;

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) {
          onMarkRead();
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="nav-notification-trigger"
          aria-label={triggerLabel}
          data-testid={`button-notification-center-${variant}`}
        >
          <Bell className="h-4 w-4" aria-hidden="true" />
          {unreadCount > 0 ? (
            <span
              className="absolute -right-1 -top-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full border-2 border-background bg-destructive px-1 text-2xs font-bold leading-none text-destructive-foreground"
              aria-hidden="true"
            >
              {unreadCount}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[min(24rem,calc(100vw-1rem))] overflow-hidden p-0"
        aria-label="Pusat notifikasi"
      >
        <div className="flex min-h-16 items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-foreground">Notifikasi</h2>
            <p className="text-xs text-muted-foreground">Sejarah sesi semasa</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            disabled={entries.length === 0}
            onClick={onClear}
            aria-label="Kosongkan sejarah notifikasi"
          >
            <Trash2 aria-hidden="true" />
            Kosongkan
          </Button>
        </div>

        {entries.length > 0 ? (
          <div
            className="grid grid-cols-3 gap-2 border-b border-border bg-background px-3 py-2"
            role="group"
            aria-label="Ringkasan notifikasi"
          >
            {severitySummary.map((item) => (
              <div
                key={item.id}
                className="rounded-lg border border-border bg-muted/40 px-2 py-1.5 text-center"
              >
                <span className="block text-2xs font-semibold text-foreground">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-sm font-bold leading-none text-foreground">
                  {item.count}
                </span>
              </div>
            ))}
          </div>
        ) : null}

        {entries.length > 0 ? (
          <div
            className="flex flex-wrap gap-1 border-b border-border bg-muted/20 px-3 py-2"
            role="tablist"
            aria-label="Tapis notifikasi"
          >
            {notificationFilters.map((filter) => {
              const selected = activeFilter === filter.id;

              return (
                <button
                  key={filter.id}
                  type="button"
                  id={`notification-center-${variant}-filter-${filter.id}`}
                  role="tab"
                  aria-controls={filterPanelId}
                  aria-selected={selected}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "border-primary/40 bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                  onClick={() => setActiveFilter(filter.id)}
                >
                  {filter.label}
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-2xs",
                      selected
                        ? "bg-primary-foreground/20 text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                    aria-hidden="true"
                  >
                    {filterCounts[filter.id]}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {entries.length === 0 ? (
          <div className="flex min-h-44 flex-col items-center justify-center gap-3 px-6 py-8 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <BellOff className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">Tiada notifikasi</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Makluman baharu akan muncul di sini.
              </p>
            </div>
          </div>
        ) : visibleEntries.length === 0 ? (
          <div
            id={filterPanelId}
            role="tabpanel"
            aria-labelledby={activeFilterTabId}
            className="flex min-h-44 flex-col items-center justify-center gap-3 px-6 py-8 text-center"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <BellOff className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <p className="text-sm font-medium text-foreground">Tiada notifikasi dalam filter ini</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Tukar filter untuk melihat sejarah sesi lain.
              </p>
            </div>
          </div>
        ) : (
          <div
            id={filterPanelId}
            role="tabpanel"
            aria-labelledby={activeFilterTabId}
            className="max-h-[min(26rem,calc(100svh-8rem))] overflow-y-auto overscroll-contain"
          >
            {groupedVisibleEntries.map((group) => (
              <section
                key={group.module}
                className="border-b border-border/70 last:border-b-0"
                aria-label={`Notifikasi ${group.module}`}
              >
                <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-border/70 bg-popover px-4 py-2">
                  <p className="truncate text-2xs font-bold uppercase tracking-label-xs text-foreground">
                    {group.module}
                  </p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-2xs font-semibold text-foreground">
                    {group.entries.length}
                  </span>
                </div>
                <ol aria-label={`Sejarah notifikasi ${group.module}`}>
                  {group.entries.map((entry) => {
                    const presentation = getNotificationHistoryPresentation(entry.variant);
                    const NotificationIcon = notificationIcons[entry.variant];

                    return (
                      <li
                        key={entry.id}
                        className="flex gap-3 border-b border-border/70 px-4 py-3 last:border-b-0"
                      >
                        <span
                          className={cn(
                            "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted",
                            presentation.toneClassName,
                          )}
                          aria-hidden="true"
                        >
                          <NotificationIcon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-3">
                            <p className="min-w-0 break-words text-sm font-medium text-foreground">
                              {entry.title}
                            </p>
                            <time
                              className="shrink-0 whitespace-nowrap text-2xs text-muted-foreground"
                              dateTime={new Date(entry.createdAt).toISOString()}
                            >
                              {formatNotificationHistoryTimestamp(entry.createdAt)}
                            </time>
                          </div>
                          <p className={cn("mt-0.5 text-2xs font-semibold", presentation.toneClassName)}>
                            {presentation.label}
                          </p>
                          {entry.description ? (
                            <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">
                              {entry.description}
                            </p>
                          ) : null}
                          {entry.occurrenceCount > 1 ? (
                            <span className="mt-2 inline-flex rounded-full bg-muted px-2 py-0.5 text-2xs font-semibold text-muted-foreground">
                              Berlaku {entry.occurrenceCount > 99 ? "99+" : entry.occurrenceCount} kali
                            </span>
                          ) : null}
                          {entry.action ? (
                            <div className="mt-3">
                              <Button asChild variant="outline" size="sm" className="min-h-8 px-2.5">
                                <a
                                  href={entry.action.href}
                                  aria-label={`${entry.action.label}: ${entry.title}`}
                                >
                                  {entry.action.label}
                                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </a>
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
