import type { CollectionMonthlySummary } from "@/lib/api";

const DEFAULT_COLLECTION_SUMMARY_CACHE_LIMIT = 12;

export type CollectionSummaryCacheEntry = {
  summaryRows: CollectionMonthlySummary[];
};

export function normalizeCollectionSummaryNicknames(nicknames?: string[]) {
  return Array.from(
    new Set(
      (Array.isArray(nicknames) ? nicknames : [])
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function buildCollectionSummaryCacheKey(params: {
  year: number;
  nicknames?: string[];
}) {
  return JSON.stringify({
    year: params.year,
    nicknames: normalizeCollectionSummaryNicknames(params.nicknames),
  });
}

export function createCollectionSummaryCache(maxEntries = DEFAULT_COLLECTION_SUMMARY_CACHE_LIMIT) {
  const entries = new Map<string, CollectionSummaryCacheEntry>();

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
        summaryRows: [...entry.summaryRows],
      } satisfies CollectionSummaryCacheEntry;
    },
    set(key: string, entry: CollectionSummaryCacheEntry) {
      if (entries.has(key)) {
        entries.delete(key);
      }

      entries.set(key, {
        summaryRows: [...entry.summaryRows],
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
