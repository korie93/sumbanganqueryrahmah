import type { CollectionReportFreshness } from "@/lib/api";
import type { NicknameTotalSummary } from "@/pages/collection-nickname-summary/utils";

const DEFAULT_COLLECTION_NICKNAME_SUMMARY_CACHE_LIMIT = 12;

export type CollectionNicknameSummaryCacheEntry = {
  nicknameTotals: NicknameTotalSummary[];
  totalAmount: number;
  totalRecords: number;
  freshness: CollectionReportFreshness | null;
};

export function normalizeCollectionNicknameSummaryNicknames(nicknames?: string[]) {
  return Array.from(
    new Set(
      (Array.isArray(nicknames) ? nicknames : [])
        .map((value) => String(value || "").trim().toLowerCase())
        .filter(Boolean),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function buildCollectionNicknameSummaryCacheKey(params: {
  from?: string;
  to?: string;
  nicknames?: string[];
}) {
  return JSON.stringify({
    from: String(params.from || "").trim() || null,
    to: String(params.to || "").trim() || null,
    nicknames: normalizeCollectionNicknameSummaryNicknames(params.nicknames),
  });
}

export function createCollectionNicknameSummaryCache(
  maxEntries = DEFAULT_COLLECTION_NICKNAME_SUMMARY_CACHE_LIMIT,
) {
  const entries = new Map<string, CollectionNicknameSummaryCacheEntry>();

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
        nicknameTotals: [...entry.nicknameTotals],
        totalAmount: entry.totalAmount,
        totalRecords: entry.totalRecords,
        freshness: entry.freshness ? { ...entry.freshness } : null,
      } satisfies CollectionNicknameSummaryCacheEntry;
    },
    set(key: string, entry: CollectionNicknameSummaryCacheEntry) {
      if (entries.has(key)) {
        entries.delete(key);
      }

      entries.set(key, {
        nicknameTotals: [...entry.nicknameTotals],
        totalAmount: Number(entry.totalAmount || 0),
        totalRecords: Number(entry.totalRecords || 0),
        freshness: entry.freshness ? { ...entry.freshness } : null,
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
