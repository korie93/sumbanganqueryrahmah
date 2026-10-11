import type { ActiveFilterChip } from "@/components/data/ActiveFilterChips";
import { formatIsoDateToDDMMYYYY } from "@/lib/date-format";
import type { CollectionRecordsFiltersProps } from "./CollectionRecordsFilters";
import { buildCollectionRecordFilterSnapshot } from "./collection-record-filters";

const sortLabels: Record<string, string> = {
  paymentDate_asc: "Tarikh bayaran: terlama",
  amount_desc: "Jumlah: tertinggi",
  amount_asc: "Jumlah: terendah",
  source_asc: "Source: A-Z",
  aging_asc: "Aging: D3-D6",
  classification_asc: "Classification: A-Z",
};

// Use the same normalization/permission gates as the existing query. These chips
// describe selected controls, not a claim that a pending request has completed.
export function buildCollectionRecordsActiveFilters(controls: CollectionRecordsFiltersProps) {
  const filters = buildCollectionRecordFilterSnapshot(controls);
  const items: ActiveFilterChip[] = [];
  if (filters.from) items.push({
    id: "collection-from-date", label: `From ${formatIsoDateToDDMMYYYY(filters.from)}`,
    onRemove: () => controls.onFromDateChange(""),
  });
  if (filters.to) items.push({
    id: "collection-to-date", label: `To ${formatIsoDateToDDMMYYYY(filters.to)}`,
    onRemove: () => controls.onToDateChange(""),
  });
  if (filters.search) items.push({
    id: "collection-search", label: `Search: ${filters.search}`,
    onRemove: () => controls.onSearchInputChange(""),
  });
  if (filters.nickname) items.push({
    id: "collection-nickname", label: `Nickname: ${filters.nickname}`,
    onRemove: () => controls.onNicknameFilterChange("all"),
  });
  if (filters.leaderId) {
    const team = controls.teamOptions.find((item) => item.id === filters.leaderId);
    items.push({ id: "collection-team-leader", label: `Leader: ${team?.leaderNickname || "Selected team"}`,
      onRemove: () => controls.onLeaderFilterChange("all") });
  }
  if (filters.sourceImportIds?.length) {
    const source = controls.sourceOptions.find((item) => item.sourceImportId === filters.sourceImportIds?.[0]);
    items.push({ id: "collection-source", label: `Source: ${source?.sourceImportName || source?.sourceFilename || "Selected source"}`,
      onRemove: () => controls.onSourceImportFilterChange("all") });
  }
  if (filters.agingBuckets?.length) items.push({
    id: "collection-aging", label: `Aging: ${filters.agingBuckets[0]}`,
    onRemove: () => controls.onAgingFilterChange("all"),
  });
  if (filters.classifications?.length) items.push({
    id: "collection-classification", label: `Classification: ${filters.classifications[0] === "cp" ? "CP" : "Abort CP"}`,
    onRemove: () => controls.onClassificationFilterChange("all"),
  });
  const sortKey = `${filters.sortBy}_${filters.sortDirection}`;
  if (sortKey !== "paymentDate_desc") items.push({
    id: "collection-sort", label: `Sort: ${sortLabels[sortKey] || "Custom order"}`,
    onRemove: () => controls.onSortValueChange("paymentDate_desc"),
  });
  return { items, filterCount: items.filter((item) => item.id !== "collection-search").length };
}
