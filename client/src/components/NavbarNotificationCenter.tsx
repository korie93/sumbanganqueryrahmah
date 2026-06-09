import {
  Bell,
  BellOff,
  CircleAlert,
  CircleCheck,
  Info,
  Trash2,
  TriangleAlert,
} from "lucide-react";

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
import type { NotificationHistoryState } from "@/hooks/use-notification-history";
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
  const triggerLabel = unreadCount > 0
    ? `Buka pusat notifikasi, ${unreadCount} belum dibaca`
    : "Buka pusat notifikasi";

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
        ) : (
          <ol
            className="max-h-[min(26rem,calc(100svh-8rem))] overflow-y-auto overscroll-contain"
            aria-label="Sejarah notifikasi"
          >
            {entries.map((entry) => {
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
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </PopoverContent>
    </Popover>
  );
}
