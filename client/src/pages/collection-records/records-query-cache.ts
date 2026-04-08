import type { CollectionRecord } from "@/lib/api";
import type { CollectionRecordFilters } from "@/pages/collection-records/types";

const DEFAULT_COLLECTION_RECORDS_CACHE_LIMIT = 24;

export type CollectionRecordsCacheEntry = {
  records: CollectionRecord[];
  totalRecords?: number | undefined;
  totalAmount?: number | undefined;
  nextCursor?: string | null | undefined;
};

export function normalizeCollectionRecordFilterValue(value: unknown) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export function buildCollectionRecordsCacheKey(filters?: CollectionRecordFilters) {
  const pageSize = Number.isFinite(Number(filters?.pageSize))
    ? Number(filters?.pageSize)
    : Number.isFinite(Number(filters?.limit))
      ? Number(filters?.limit)
      : null;
  const page = Number.isFinite(Number(filters?.page))
    ? Number(filters?.page)
    : pageSize && Number.isFinite(Number(filters?.offset))
      ? Math.floor(Number(filters?.offset) / pageSize) + 1
      : null;
  return JSON.stringify({
    from: normalizeCollectionRecordFilterValue(filters?.from),
    to: normalizeCollectionRecordFilterValue(filters?.to),
    search: normalizeCollectionRecordFilterValue(filters?.search)?.toLowerCase() || null,
    nickname: normalizeCollectionRecordFilterValue(filters?.nickname)?.toLowerCase() || null,
    page,
    pageSize,
    cursor: normalizeCollectionRecordFilterValue(filters?.cursor),
  });
}

export function createCollectionRecordsCache(maxEntries = DEFAULT_COLLECTION_RECORDS_CACHE_LIMIT) {
  const entries = new Map<string, CollectionRecordsCacheEntry>();

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
        totalRecords:
          typeof entry.totalRecords === "number" ? entry.totalRecords : undefined,
        totalAmount:
          typeof entry.totalAmount === "number" ? entry.totalAmount : undefined,
        nextCursor:
          entry.nextCursor === null || typeof entry.nextCursor === "string"
            ? entry.nextCursor
            : undefined,
      } satisfies CollectionRecordsCacheEntry;
    },
    set(key: string, entry: CollectionRecordsCacheEntry) {
      if (entries.has(key)) {
        entries.delete(key);
      }

      entries.set(key, {
        records: [...entry.records],
        totalRecords:
          typeof entry.totalRecords === "number" ? entry.totalRecords : undefined,
        totalAmount:
          typeof entry.totalAmount === "number" ? entry.totalAmount : undefined,
        nextCursor:
          entry.nextCursor === null || typeof entry.nextCursor === "string"
            ? entry.nextCursor
            : undefined,
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
