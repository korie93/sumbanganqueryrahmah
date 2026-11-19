import type { CollectionRecordFilters } from "@/pages/collection-records/types";

// Sorting/pagination change presentation, not which records can match.
export function getCollectionRecordsRecoveryState(filters: CollectionRecordFilters) {
  return {
    hasSearch: Boolean(filters.search?.trim()),
    hasFilters: Boolean(
      filters.from || filters.to || filters.nickname || filters.leaderId
      || filters.sourceImportIds?.length || filters.agingBuckets?.length || filters.classifications?.length || filters.duplicateOnly,
    ),
  };
}

type BuildCollectionRecordFilterSnapshotArgs = {
  fromDate?: string;
  toDate?: string;
  searchInput?: string;
  canUseNicknameFilter: boolean;
  canUseDuplicateFilter?: boolean;
  duplicateOnly?: boolean;
  nicknameFilter?: string;
  canUseTeamLeaderFilter?: boolean;
  leaderFilter?: string;
  sourceImportFilter?: string;
  agingFilter?: string;
  classificationFilter?: string;
  sortValue?: string;
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
  canUseDuplicateFilter,
  duplicateOnly,
  nicknameFilter,
  canUseTeamLeaderFilter = false,
  leaderFilter,
  sourceImportFilter,
  agingFilter,
  classificationFilter,
  sortValue,
  limit,
  offset,
}: BuildCollectionRecordFilterSnapshotArgs): CollectionRecordFilters {
  const normalizedNickname = normalizeCollectionFilterText(nicknameFilter);
  const normalizedLeader = normalizeCollectionFilterText(leaderFilter);
  const normalizedSourceImport = normalizeCollectionFilterText(sourceImportFilter);
  const normalizedAging = normalizeCollectionFilterText(agingFilter)?.toUpperCase();
  const normalizedClassification = normalizeCollectionFilterText(classificationFilter)?.toLowerCase();
  const [sortByCandidate, sortDirectionCandidate] = String(sortValue || "paymentDate_desc").split("_");
  const allowedSortFields = new Set([
    "paymentDate",
    "amount",
    "customerName",
    "source",
    "aging",
    "classification",
  ]);
  const sortBy = allowedSortFields.has(sortByCandidate || "")
    ? sortByCandidate as CollectionRecordFilters["sortBy"]
    : "paymentDate";
  const sortDirection = sortDirectionCandidate === "asc" ? "asc" : "desc";

  return {
    from: normalizeCollectionFilterText(fromDate),
    to: normalizeCollectionFilterText(toDate),
    search: normalizeCollectionFilterText(searchInput),
    ...(canUseDuplicateFilter && duplicateOnly ? { duplicateOnly: true } : {}),
    nickname:
      canUseNicknameFilter
      && normalizedNickname
      && normalizedNickname !== "all"
        ? normalizedNickname
        : undefined,
    ...(canUseTeamLeaderFilter && normalizedLeader && normalizedLeader !== "all"
      ? { leaderId: normalizedLeader }
      : {}),
    sourceImportIds:
      normalizedSourceImport && normalizedSourceImport !== "all"
        ? [normalizedSourceImport]
        : undefined,
    agingBuckets:
      normalizedAging && ["D3", "D4", "D5", "D6"].includes(normalizedAging)
        ? [normalizedAging as "D3" | "D4" | "D5" | "D6"]
        : undefined,
    classifications:
      normalizedClassification === "cp" || normalizedClassification === "abort_cp"
        ? [normalizedClassification]
        : undefined,
    sortBy,
    sortDirection,
    limit,
    offset,
  };
}

// List pages, View All and exports use the same selection with different pagination.
export function getCollectionRecordCriteria(filters: CollectionRecordFilters) {
  return {
    from: filters.from,
    to: filters.to,
    search: filters.search,
    nickname: filters.nickname,
    leaderId: filters.leaderId,
    sourceImportIds: filters.sourceImportIds,
    agingBuckets: filters.agingBuckets,
    classifications: filters.classifications,
    ...(filters.duplicateOnly ? { duplicateOnly: true } : {}),
    sortBy: filters.sortBy,
    sortDirection: filters.sortDirection,
  };
}
