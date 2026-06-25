import {
  getBrowserLocalStorage,
  safeGetStorageItem,
  safeRemoveStorageItem,
  safeSetStorageItem,
  type BrowserStorageLike,
} from "@/lib/browser-storage";
import { safeJsonParseResult } from "@/lib/utils/safe-json";

export const ACTIVITY_COLUMN_PREFERENCE_STORAGE_KEY = "sqr.activity.columns.v1";

export const ACTIVITY_COLUMN_DEFINITIONS = [
  { id: "user", label: "User", width: "minmax(10rem, 1.25fr)" },
  { id: "status", label: "Status", width: "6.5rem" },
  { id: "ip", label: "IP", width: "10rem" },
  { id: "device", label: "Device", width: "minmax(11rem, 1fr)" },
  { id: "browser", label: "Browser", width: "minmax(12rem, 1.2fr)" },
  { id: "login", label: "Login", width: "8.5rem" },
  { id: "logout", label: "Logout", width: "8.5rem" },
  { id: "duration", label: "Duration", width: "7rem" },
] as const;

export type ActivityColumnId = (typeof ACTIVITY_COLUMN_DEFINITIONS)[number]["id"];

export type ActivityColumnPreferences = {
  order: ActivityColumnId[];
  visible: ActivityColumnId[];
};

const ACTIVITY_COLUMN_IDS = ACTIVITY_COLUMN_DEFINITIONS.map((column) => column.id);
const ACTIVITY_COLUMN_ID_SET = new Set<string>(ACTIVITY_COLUMN_IDS);
const ACTIVITY_COLUMN_WIDTHS = new Map(
  ACTIVITY_COLUMN_DEFINITIONS.map((column) => [column.id, column.width]),
);

function getStorage(storage?: BrowserStorageLike | null) {
  return storage === undefined ? getBrowserLocalStorage() : storage;
}

function isActivityColumnId(value: unknown): value is ActivityColumnId {
  return typeof value === "string" && ACTIVITY_COLUMN_ID_SET.has(value);
}

function normalizeColumnList(value: unknown): ActivityColumnId[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.filter(isActivityColumnId)));
}

export function getDefaultActivityColumnPreferences(): ActivityColumnPreferences {
  return {
    order: [...ACTIVITY_COLUMN_IDS],
    visible: [...ACTIVITY_COLUMN_IDS],
  };
}

export function normalizeActivityColumnPreferences(value: unknown): ActivityColumnPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return getDefaultActivityColumnPreferences();
  }

  const candidate = value as Record<string, unknown>;
  const storedOrder = normalizeColumnList(candidate.order);
  const order = [
    ...storedOrder,
    ...ACTIVITY_COLUMN_IDS.filter((column) => !storedOrder.includes(column)),
  ];
  const visible = normalizeColumnList(candidate.visible).filter((column) => order.includes(column));

  return {
    order,
    visible: visible.length > 0 ? visible : [order[0]],
  };
}

export function readActivityColumnPreferences(
  storage?: BrowserStorageLike | null,
): ActivityColumnPreferences {
  const resolvedStorage = getStorage(storage);
  const raw = safeGetStorageItem(resolvedStorage, ACTIVITY_COLUMN_PREFERENCE_STORAGE_KEY);
  if (!raw) {
    return getDefaultActivityColumnPreferences();
  }

  const parsed = safeJsonParseResult<unknown>(raw, {
    maxDepth: 4,
    maxNodes: 40,
    maxRawLength: 4_096,
    maxStringLength: 32,
  });
  if (!parsed.ok) {
    safeRemoveStorageItem(resolvedStorage, ACTIVITY_COLUMN_PREFERENCE_STORAGE_KEY);
    return getDefaultActivityColumnPreferences();
  }

  return normalizeActivityColumnPreferences(parsed.data);
}

export function writeActivityColumnPreferences(
  preferences: ActivityColumnPreferences,
  storage?: BrowserStorageLike | null,
): boolean {
  const resolvedStorage = getStorage(storage);
  const normalized = normalizeActivityColumnPreferences(preferences);
  return safeSetStorageItem(
    resolvedStorage,
    ACTIVITY_COLUMN_PREFERENCE_STORAGE_KEY,
    JSON.stringify(normalized),
    {
      onQuotaExceeded: () =>
        safeRemoveStorageItem(resolvedStorage, ACTIVITY_COLUMN_PREFERENCE_STORAGE_KEY),
    },
  );
}

export function toggleActivityColumn(
  preferences: ActivityColumnPreferences,
  column: ActivityColumnId,
): ActivityColumnPreferences {
  const visible = new Set(preferences.visible);
  if (visible.has(column)) {
    if (visible.size === 1) {
      return preferences;
    }
    visible.delete(column);
  } else {
    visible.add(column);
  }

  return {
    ...preferences,
    visible: preferences.order.filter((candidate) => visible.has(candidate)),
  };
}

export function moveActivityColumn(
  preferences: ActivityColumnPreferences,
  column: ActivityColumnId,
  direction: -1 | 1,
): ActivityColumnPreferences {
  const index = preferences.order.indexOf(column);
  const destination = index + direction;
  if (index < 0 || destination < 0 || destination >= preferences.order.length) {
    return preferences;
  }

  const order = [...preferences.order];
  [order[index], order[destination]] = [order[destination], order[index]];
  return {
    order,
    visible: order.filter((candidate) => preferences.visible.includes(candidate)),
  };
}

export function getVisibleActivityColumns(
  preferences: ActivityColumnPreferences,
): ActivityColumnId[] {
  return preferences.order.filter((column) => preferences.visible.includes(column));
}

export function getActivityGridTemplateColumns(
  columns: ActivityColumnId[],
  canModerateActivity: boolean,
): string {
  const tracks: string[] = columns.map(
    (column) => ACTIVITY_COLUMN_WIDTHS.get(column) ?? "8rem",
  );
  if (canModerateActivity) {
    tracks.unshift("3rem");
    tracks.push("minmax(10rem, auto)");
  }
  return tracks.join(" ");
}

export function getActivityTableMinWidth(
  columns: ActivityColumnId[],
  canModerateActivity: boolean,
): number {
  const baseWidth = columns.reduce((total, column) => {
    const definition = ACTIVITY_COLUMN_DEFINITIONS.find((candidate) => candidate.id === column);
    const widthByColumn: Record<ActivityColumnId, number> = {
      user: 160,
      status: 104,
      ip: 160,
      device: 176,
      browser: 192,
      login: 136,
      logout: 136,
      duration: 112,
    };
    return total + (definition ? widthByColumn[definition.id] : 128);
  }, 0);

  const trackCount = columns.length + (canModerateActivity ? 2 : 0);
  const gridGapWidth = Math.max(0, trackCount - 1) * 12;
  const horizontalPadding = 24;

  return Math.max(
    560,
    baseWidth
      + (canModerateActivity ? 208 : 0)
      + gridGapWidth
      + horizontalPadding,
  );
}
