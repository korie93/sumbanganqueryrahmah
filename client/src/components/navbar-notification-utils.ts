import type {
  NotificationHistoryEntry,
  NotificationHistoryVariant,
} from "@/hooks/use-notification-history";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const NOTIFICATION_TIME_ZONE = "Asia/Kuala_Lumpur";
const NOTIFICATION_OCCURRENCE_DISPLAY_LIMIT = 99;

const notificationDateTimeFormatter = new Intl.DateTimeFormat("ms-MY", {
  timeZone: NOTIFICATION_TIME_ZONE,
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

const notificationTimeFormatter = new Intl.DateTimeFormat("ms-MY", {
  timeZone: NOTIFICATION_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

const notificationDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: NOTIFICATION_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
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
  const isSameDay =
    notificationDayFormatter.format(createdAt)
    === notificationDayFormatter.format(new Date(now));

  return isSameDay
    ? notificationTimeFormatter.format(createdAt)
    : notificationDateTimeFormatter.format(createdAt);
}

export function getNotificationHistoryPresentation(
  variant: NotificationHistoryEntry["variant"],
): NotificationHistoryPresentation {
  return NOTIFICATION_PRESENTATION[variant];
}

export function formatNotificationOccurrenceDigest(count: number): string {
  if (!Number.isFinite(count) || count <= 1) {
    return "";
  }

  const normalizedCount = Math.trunc(count);
  const countLabel = normalizedCount > NOTIFICATION_OCCURRENCE_DISPLAY_LIMIT
    ? `${NOTIFICATION_OCCURRENCE_DISPLAY_LIMIT}+`
    : String(normalizedCount);

  return `Digest: ${countLabel} kejadian serupa`;
}
