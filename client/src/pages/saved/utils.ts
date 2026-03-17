import type { ImportItem } from "@/pages/saved/types";
import { formatDateTimeDDMMYYYY } from "@/lib/date-format";

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
        const itemDate = new Date(item.createdAt);
        return (
          itemDate.getFullYear() === dateFilter.getFullYear() &&
          itemDate.getMonth() === dateFilter.getMonth() &&
          itemDate.getDate() === dateFilter.getDate()
        );
      })();

    return matchesSearch && matchesDate;
  });
}

export function formatSavedImportDate(dateStr: string) {
  return formatDateTimeDDMMYYYY(dateStr, { fallback: dateStr });
}
