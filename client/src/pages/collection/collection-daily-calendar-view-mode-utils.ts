import {
  getBrowserLocalStorage,
  safeGetStorageItem,
  safeSetStorageItem,
} from "@/lib/browser-storage";

export const COLLECTION_DAILY_CALENDAR_VIEW_MODE_STORAGE_KEY =
  "sqr.collectionDaily.calendarViewMode";

export const COLLECTION_DAILY_CALENDAR_VIEW_MODES = [
  "list",
  "icon-sm",
  "icon-md",
  "icon-lg",
  "tiles",
  "heatmap",
  "content",
] as const;

export type CollectionDailyCalendarViewMode =
  (typeof COLLECTION_DAILY_CALENDAR_VIEW_MODES)[number];

export const DEFAULT_COLLECTION_DAILY_CALENDAR_VIEW_MODE: CollectionDailyCalendarViewMode =
  "content";

export type CollectionDailyCalendarViewModeOption = {
  id: CollectionDailyCalendarViewMode;
  label: string;
  shortLabel: string;
  description: string;
};

export const COLLECTION_DAILY_CALENDAR_VIEW_MODE_OPTIONS: readonly CollectionDailyCalendarViewModeOption[] =
  [
    {
      id: "list",
      label: "List",
      shortLabel: "List",
      description: "Paparan baris untuk scan setiap tarikh dengan teks lebih jelas.",
    },
    {
      id: "icon-sm",
      label: "Small icons",
      shortLabel: "S",
      description: "Paparan ikon kecil untuk bulan yang padat dan cepat discan.",
    },
    {
      id: "icon-md",
      label: "Medium icons",
      shortLabel: "M",
      description: "Paparan ikon sederhana dengan sedikit ringkasan status.",
    },
    {
      id: "icon-lg",
      label: "Large icons",
      shortLabel: "L",
      description: "Paparan ikon besar untuk tarikh dan status yang lebih menonjol.",
    },
    {
      id: "tiles",
      label: "Tiles",
      shortLabel: "Tiles",
      description: "Paparan tile seimbang dengan jumlah kutipan dan status ringkas.",
    },
    {
      id: "heatmap",
      label: "Heatmap",
      shortLabel: "Map",
      description: "Paparan warna prestasi untuk nampak pattern kutipan sebulan dengan cepat.",
    },
    {
      id: "content",
      label: "Content",
      shortLabel: "Full",
      description: "Paparan penuh dengan kutipan, pelanggan, target, progress dan status.",
    },
  ];

export function normalizeCollectionDailyCalendarViewMode(
  value: unknown,
): CollectionDailyCalendarViewMode {
  return typeof value === "string" &&
    COLLECTION_DAILY_CALENDAR_VIEW_MODES.includes(value as CollectionDailyCalendarViewMode)
    ? (value as CollectionDailyCalendarViewMode)
    : DEFAULT_COLLECTION_DAILY_CALENDAR_VIEW_MODE;
}

export function isCollectionDailyCalendarIconViewMode(
  value: CollectionDailyCalendarViewMode,
): boolean {
  return value === "icon-sm" || value === "icon-md" || value === "icon-lg";
}

export function getCollectionDailyCalendarViewModeStatusText(
  mode: CollectionDailyCalendarViewMode,
): string {
  const option =
    COLLECTION_DAILY_CALENDAR_VIEW_MODE_OPTIONS.find((item) => item.id === mode) ??
    COLLECTION_DAILY_CALENDAR_VIEW_MODE_OPTIONS[
      COLLECTION_DAILY_CALENDAR_VIEW_MODE_OPTIONS.length - 1
    ];
  return `Paparan kalendar: ${option.label}. ${option.description}`;
}

export function readCollectionDailyCalendarViewModePreference(): CollectionDailyCalendarViewMode {
  return normalizeCollectionDailyCalendarViewMode(
    safeGetStorageItem(
      getBrowserLocalStorage(),
      COLLECTION_DAILY_CALENDAR_VIEW_MODE_STORAGE_KEY,
    ),
  );
}

export function writeCollectionDailyCalendarViewModePreference(
  mode: CollectionDailyCalendarViewMode,
): void {
  safeSetStorageItem(
    getBrowserLocalStorage(),
    COLLECTION_DAILY_CALENDAR_VIEW_MODE_STORAGE_KEY,
    mode,
  );
}
