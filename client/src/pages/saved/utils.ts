import type { ImportItem } from "@/pages/saved/types";
import {
  formatDateDDMMYYYYMalaysia,
  formatDateKeyInMalaysia,
  formatDateTimeMalaysia,
} from "@/lib/date-format";

export function filterSavedImports(
  imports: ImportItem[],
  searchTerm: string,
  dateFilter?: Date,
) {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  return imports.filter((item) => {
    const matchesSearch =
      normalizedSearch === "" ||
      item.name.toLowerCase().includes(normalizedSearch) ||
      item.filename.toLowerCase().includes(normalizedSearch);

    const matchesDate =
      !dateFilter ||
      (() => {
        return formatDateKeyInMalaysia(item.createdAt) === formatDateKeyInMalaysia(dateFilter);
      })();

    return matchesSearch && matchesDate;
  });
}

export function formatSavedImportDate(dateStr: string) {
  return formatDateTimeMalaysia(dateStr, { fallback: dateStr });
}

export function formatSavedFilterDate(date: Date) {
  return formatDateDDMMYYYYMalaysia(date);
}
