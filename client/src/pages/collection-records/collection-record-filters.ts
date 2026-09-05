import type { CollectionRecordFilters } from "@/pages/collection-records/types";

type BuildCollectionRecordFilterSnapshotArgs = {
  fromDate?: string;
  toDate?: string;
  searchInput?: string;
  canUseNicknameFilter: boolean;
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
