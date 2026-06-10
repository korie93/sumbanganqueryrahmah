import { useSyncExternalStore, type ReactNode } from "react";

export const NOTIFICATION_HISTORY_LIMIT = 20;
export const NOTIFICATION_HISTORY_LISTENER_LIMIT = 20;
const NOTIFICATION_TITLE_LIMIT = 120;
const NOTIFICATION_DESCRIPTION_LIMIT = 240;
const NOTIFICATION_ACTION_LABEL_LIMIT = 60;
const NOTIFICATION_ACTION_HREF_LIMIT = 200;
const NOTIFICATION_MODULE_LIMIT = 48;

export type NotificationHistoryVariant =
  | "default"
  | "destructive"
  | "info"
  | "success"
  | "warning";

export type NotificationHistoryEntry = {
  id: string;
  title: string;
  description: string;
  variant: NotificationHistoryVariant;
  occurrenceCount: number;
  createdAt: number;
  unread: boolean;
  action?: NotificationHistoryAction;
  module?: string;
  dedupeKey?: string;
};

export type NotificationHistoryAction = {
  label: string;
  href: string;
};

export type NotificationHistoryState = {
  entries: NotificationHistoryEntry[];
  unreadCount: number;
};

type RecordNotificationHistoryInput = {
  title?: ReactNode | undefined;
  description?: ReactNode | undefined;
  variant?: NotificationHistoryVariant | null | undefined;
  occurrenceCount: number;
  historyAction?: {
    label?: ReactNode | undefined;
    href?: string | null | undefined;
  } | null | undefined;
  historyModule?: ReactNode | undefined;
  loading?: boolean | undefined;
  dedupeKey?: string | undefined;
  createdAt?: number | undefined;
};

let historyId = 0;
let historyState: NotificationHistoryState = {
  entries: [],
  unreadCount: 0,
};
const historyListeners = new Set<() => void>();

function normalizeHistoryText(value: ReactNode, maxLength: number): string {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  return String(value)
    .split("")
    .map((character) => {
      const codePoint = character.charCodeAt(0);
      return codePoint <= 31 || codePoint === 127 ? " " : character;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function normalizeHistoryVariant(
  variant: NotificationHistoryVariant | null | undefined,
): NotificationHistoryVariant {
  return variant ?? "default";
}

function normalizeHistoryActionHref(value: string | null | undefined): string {
  if (typeof value !== "string") {
    return "";
  }

  const href = value.trim().slice(0, NOTIFICATION_ACTION_HREF_LIMIT);
  if (
    !href.startsWith("/")
    || href.startsWith("//")
    || href.includes(":")
    || href.includes("\\")
    || /\s/.test(href)
  ) {
    return "";
  }

  return href;
}

function normalizeHistoryAction(
  action: RecordNotificationHistoryInput["historyAction"],
): NotificationHistoryAction | undefined {
  const label = normalizeHistoryText(action?.label, NOTIFICATION_ACTION_LABEL_LIMIT);
  const href = normalizeHistoryActionHref(action?.href);
  if (!label || !href) {
    return undefined;
  }
  return { label, href };
}

function emitHistoryState(nextEntries: NotificationHistoryEntry[]): void {
  historyState = {
    entries: nextEntries,
    unreadCount: nextEntries.filter((entry) => entry.unread).length,
  };
  for (const listener of Array.from(historyListeners)) {
    listener();
  }
}

function nextHistoryId(): string {
  historyId = (historyId + 1) % Number.MAX_SAFE_INTEGER;
  return `notification-${historyId}`;
}

export function recordNotificationHistory(
  input: RecordNotificationHistoryInput,
): void {
  if (input.loading) {
    return;
  }

  const title = normalizeHistoryText(input.title, NOTIFICATION_TITLE_LIMIT);
  const description = normalizeHistoryText(
    input.description,
    NOTIFICATION_DESCRIPTION_LIMIT,
  );
  if (!title && !description) {
    return;
  }

  const variant = normalizeHistoryVariant(input.variant);
  const dedupeKey = String(input.dedupeKey || "").trim();
  const action = normalizeHistoryAction(input.historyAction);
  const module = normalizeHistoryText(input.historyModule, NOTIFICATION_MODULE_LIMIT);
  const inputCreatedAt = Number(input.createdAt);
  const createdAt = Number.isFinite(inputCreatedAt)
    && !Number.isNaN(new Date(inputCreatedAt).getTime())
    ? inputCreatedAt
    : Date.now();
  const occurrenceCount = Number.isFinite(input.occurrenceCount)
    ? Math.max(1, Math.trunc(input.occurrenceCount))
    : 1;
  const newestEntry = historyState.entries[0];

  if (
    dedupeKey
    && newestEntry?.dedupeKey === dedupeKey
    && newestEntry.variant === variant
  ) {
    const newestEntryWithoutTransientMetadata = { ...newestEntry };
    delete newestEntryWithoutTransientMetadata.action;
    delete newestEntryWithoutTransientMetadata.module;
    emitHistoryState([
      {
        ...newestEntryWithoutTransientMetadata,
        title: title || newestEntry.title,
        description: description || newestEntry.description,
        occurrenceCount,
        createdAt,
        unread: true,
        ...(action ? { action } : {}),
        ...(module ? { module } : {}),
      },
      ...historyState.entries.slice(1),
    ]);
    return;
  }

  emitHistoryState([
    {
      id: nextHistoryId(),
      title: title || "Notifikasi sistem",
      description,
      variant,
      occurrenceCount,
      createdAt,
      unread: true,
      ...(action ? { action } : {}),
      ...(module ? { module } : {}),
      ...(dedupeKey ? { dedupeKey } : {}),
    },
    ...historyState.entries,
  ].slice(0, NOTIFICATION_HISTORY_LIMIT));
}

export function markNotificationHistoryRead(): void {
  if (historyState.unreadCount === 0) {
    return;
  }
  emitHistoryState(
    historyState.entries.map((entry) => (
      entry.unread ? { ...entry, unread: false } : entry
    )),
  );
}

export function clearNotificationHistory(): void {
  if (historyState.entries.length === 0) {
    return;
  }
  emitHistoryState([]);
}

export function removeNotificationHistoryEntry(entryId: string): void {
  const normalizedEntryId = entryId.trim();
  if (!normalizedEntryId || historyState.entries.length === 0) {
    return;
  }

  const nextEntries = historyState.entries.filter(
    (entry) => entry.id !== normalizedEntryId,
  );
  if (nextEntries.length === historyState.entries.length) {
    return;
  }

  emitHistoryState(nextEntries);
}

export function subscribeNotificationHistoryState(
  listener: () => void,
): () => void {
  historyListeners.add(listener);

  while (historyListeners.size > NOTIFICATION_HISTORY_LISTENER_LIMIT) {
    const oldestListener = historyListeners.values().next().value;
    if (!oldestListener) {
      break;
    }
    historyListeners.delete(oldestListener);
  }

  return () => {
    historyListeners.delete(listener);
  };
}

function getNotificationHistorySnapshot(): NotificationHistoryState {
  return historyState;
}

export function useNotificationHistoryState(): NotificationHistoryState {
  return useSyncExternalStore(
    subscribeNotificationHistoryState,
    getNotificationHistorySnapshot,
    getNotificationHistorySnapshot,
  );
}

export function getNotificationHistoryStateForTests(): NotificationHistoryState {
  return historyState;
}

export function getNotificationHistoryListenerCountForTests(): number {
  return historyListeners.size;
}

export function resetNotificationHistoryForTests(): void {
  historyId = 0;
  emitHistoryState([]);
}
