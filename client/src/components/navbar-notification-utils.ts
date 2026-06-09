import type {
  NotificationHistoryEntry,
  NotificationHistoryVariant,
} from "@/hooks/use-notification-history";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

const notificationDateTimeFormatter = new Intl.DateTimeFormat("ms-MY", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const notificationTimeFormatter = new Intl.DateTimeFormat("ms-MY", {
  hour: "2-digit",
  minute: "2-digit",
});

export type NotificationHistoryPresentation = {
  label: string;
  toneClassName: string;
};

const NOTIFICATION_PRESENTATION: Record<
  NotificationHistoryVariant,
  NotificationHistoryPresentation
> = {
  default: {
    label: "Makluman",
    toneClassName: "text-foreground",
  },
  destructive: {
    label: "Ralat",
    toneClassName: "text-destructive",
  },
  info: {
    label: "Informasi",
    toneClassName: "text-primary",
  },
  success: {
    label: "Berjaya",
    toneClassName: "text-emerald-700 dark:text-emerald-300",
  },
  warning: {
    label: "Perhatian",
    toneClassName: "text-amber-800 dark:text-amber-300",
  },
};

export function formatNotificationHistoryTimestamp(
  timestamp: number,
  now = Date.now(),
): string {
  if (!Number.isFinite(timestamp) || !Number.isFinite(now)) {
    return "Masa tidak tersedia";
  }

  const ageMs = Math.max(0, now - timestamp);
  if (ageMs < MINUTE_MS) {
    return "Baru sahaja";
  }
  if (ageMs < HOUR_MS) {
    return `${Math.floor(ageMs / MINUTE_MS)} min lalu`;
  }

  const createdAt = new Date(timestamp);
  const current = new Date(now);
  const isSameDay =
    createdAt.getFullYear() === current.getFullYear()
    && createdAt.getMonth() === current.getMonth()
    && createdAt.getDate() === current.getDate();

  return isSameDay
    ? notificationTimeFormatter.format(createdAt)
    : notificationDateTimeFormatter.format(createdAt);
}

export function getNotificationHistoryPresentation(
  variant: NotificationHistoryEntry["variant"],
): NotificationHistoryPresentation {
  return NOTIFICATION_PRESENTATION[variant];
}
