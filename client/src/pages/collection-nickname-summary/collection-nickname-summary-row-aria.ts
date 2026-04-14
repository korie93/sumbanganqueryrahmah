import type { NicknameTotalSummary } from "@/pages/collection-nickname-summary/utils";

type CollectionNicknameSummaryRowAriaOptions = {
  formattedAmount: string;
  index: number;
  item: NicknameTotalSummary;
};

function normalizeNicknameSummaryValue(value: string | null | undefined) {
  const normalized = String(value ?? "-").replace(/\s+/g, " ").trim();
  return normalized || "-";
}

export function buildCollectionNicknameSummaryRowAriaLabel({
  formattedAmount,
  index,
  item,
}: CollectionNicknameSummaryRowAriaOptions) {
  return [
    `Nickname summary ${index}`,
    normalizeNicknameSummaryValue(item.nickname),
    `${item.totalRecords} records`,
    `total ${normalizeNicknameSummaryValue(formattedAmount)}`,
  ].join(", ");
}
