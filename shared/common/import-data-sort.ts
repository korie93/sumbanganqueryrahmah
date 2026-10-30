/** Optional exact numeric ordering for an authorized Viewer import. */
export const IMPORT_DATA_NUMERIC_SORT_DIRECTIONS = ["asc", "desc"] as const;

export type ImportDataNumericSort = {
  column: string;
  direction: typeof IMPORT_DATA_NUMERIC_SORT_DIRECTIONS[number];
};

export function isImportDataNumericSort(value: unknown): value is ImportDataNumericSort {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).length === 2
    && typeof record.column === "string"
    && record.column.trim() === record.column
    && record.column.length > 0 && record.column.length <= 120
    && (record.direction === "asc" || record.direction === "desc");
}
