import type { CollectionRecord } from "@/lib/api";

const DEFAULT_COLLECTION_MONTH_DIALOG_CACHE_LIMIT = 24;

export type CollectionMonthDialogCacheEntry = {
  records: CollectionRecord[];
  totalRecords: number;
};

export function normalizeCollectionMonthDialogNicknames(nicknames?: string[]) {
  return Array.from(
    new Set(
      (Array.isArray(nicknames) ? nicknames : [])
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function buildCollectionMonthDialogCacheKey(params: {
  year: number;
  month: number;
  page: number;
  pageSize: number;
  nicknames?: string[];
}) {
  return JSON.stringify({
    year: params.year,
    month: params.month,
    page: params.page,
    pageSize: params.pageSize,
    nicknames: normalizeCollectionMonthDialogNicknames(params.nicknames),
  });
}

export function createCollectionMonthDialogCache(maxEntries = DEFAULT_COLLECTION_MONTH_DIALOG_CACHE_LIMIT) {
  const entries = new Map<string, CollectionMonthDialogCacheEntry>();

  return {
    clear() {
      entries.clear();
    },
    get(key: string) {
      const entry = entries.get(key);
      if (!entry) {
        return null;
      }

      entries.delete(key);
      entries.set(key, entry);
      return {
        records: [...entry.records],
        totalRecords: entry.totalRecords,
      } satisfies CollectionMonthDialogCacheEntry;
    },
    set(key: string, entry: CollectionMonthDialogCacheEntry) {
      if (entries.has(key)) {
        entries.delete(key);
      }

      entries.set(key, {
        records: [...entry.records],
        totalRecords: Math.max(0, Number(entry.totalRecords || 0)),
      });

      while (entries.size > Math.max(1, Math.floor(maxEntries))) {
        const oldestKey = entries.keys().next().value;
        if (typeof oldestKey !== "string") {
          break;
        }
        entries.delete(oldestKey);
      }
    },
    size() {
      return entries.size;
    },
  };
}
