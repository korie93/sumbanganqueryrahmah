import type { ImportItem } from "@/pages/saved/types";

type SavedImportRowAriaOptions = {
  formattedCreatedAt: string;
  item: ImportItem;
};

export function buildSavedImportRowAriaLabel({
  formattedCreatedAt,
  item,
}: SavedImportRowAriaOptions) {
  const details = [
    `Saved import ${item.name}`,
    `file ${item.filename}`,
    `imported ${formattedCreatedAt}`,
  ];

  if (typeof item.rowCount === "number") {
    details.push(`${item.rowCount.toLocaleString()} rows`);
  }

  return details.join(", ");
}
