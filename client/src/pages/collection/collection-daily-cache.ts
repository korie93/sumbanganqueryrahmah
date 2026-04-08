import type {
  CollectionDailyDayDetailsResponse,
  CollectionDailyOverviewResponse,
} from "@/lib/api";

const DEFAULT_COLLECTION_DAILY_CACHE_LIMIT = 24;

export type CollectionDailyOverviewCacheEntry = {
  overview: CollectionDailyOverviewResponse;
};

export type CollectionDailyDayDetailsCacheEntry = {
  dayDetails: CollectionDailyDayDetailsResponse;
};

export function normalizeCollectionDailyCacheUsers(usernames?: string[] | undefined) {
  return Array.from(
    new Set(
      (Array.isArray(usernames) ? usernames : [])
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function buildCollectionDailyOverviewCacheKey(params: {
  year: number;
  month: number;
  usernames?: string[] | undefined;
}) {
  return JSON.stringify({
    year: params.year,
    month: params.month,
    usernames: normalizeCollectionDailyCacheUsers(params.usernames),
  });
}

export function buildCollectionDailyDayDetailsCacheKey(params: {
  date: string;
  usernames?: string[] | undefined;
  page: number;
  pageSize: number;
}) {
  return JSON.stringify({
    date: String(params.date || "").trim() || null,
    usernames: normalizeCollectionDailyCacheUsers(params.usernames),
    page: params.page,
    pageSize: params.pageSize,
  });
}

function createLruCache<TEntry>(maxEntries = DEFAULT_COLLECTION_DAILY_CACHE_LIMIT) {
  const entries = new Map<string, TEntry>();

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
      return entry;
    },
    set(key: string, entry: TEntry) {
      if (entries.has(key)) {
        entries.delete(key);
      }

      entries.set(key, entry);

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

export function createCollectionDailyOverviewCache(
  maxEntries = DEFAULT_COLLECTION_DAILY_CACHE_LIMIT,
) {
  return createLruCache<CollectionDailyOverviewCacheEntry>(maxEntries);
}

export function createCollectionDailyDayDetailsCache(
  maxEntries = DEFAULT_COLLECTION_DAILY_CACHE_LIMIT,
) {
  return createLruCache<CollectionDailyDayDetailsCacheEntry>(maxEntries);
}
