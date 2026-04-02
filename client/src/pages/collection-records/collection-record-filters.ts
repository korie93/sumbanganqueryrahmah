import type { CollectionRecordFilters } from "@/pages/collection-records/types";

type BuildCollectionRecordFilterSnapshotArgs = {
  fromDate?: string;
  toDate?: string;
  searchInput?: string;
  canUseNicknameFilter: boolean;
  nicknameFilter?: string;
  limit?: number;
  offset?: number;
};

function normalizeCollectionFilterText(value: string | undefined) {
  const normalized = String(value || "").trim();
  return normalized || undefined;
}

export function buildCollectionRecordFilterSnapshot({
  fromDate,
  toDate,
  searchInput,
  canUseNicknameFilter,
  nicknameFilter,
  limit,
  offset,
}: BuildCollectionRecordFilterSnapshotArgs): CollectionRecordFilters {
  const normalizedNickname = normalizeCollectionFilterText(nicknameFilter);

  return {
    from: normalizeCollectionFilterText(fromDate),
    to: normalizeCollectionFilterText(toDate),
    search: normalizeCollectionFilterText(searchInput),
    nickname:
      canUseNicknameFilter
      && normalizedNickname
      && normalizedNickname !== "all"
        ? normalizedNickname
        : undefined,
    limit,
    offset,
  };
}
