import { viewerFilterPresetCreateSchema, type ViewerFilterPreset } from "@shared/common/viewer-filter-presets";
import type { ImportDataNumericSort } from "@shared/common/import-data-sort";
import type { ColumnFilter } from "./types";

/** Only query settings are persisted; temporary IDs and row/presentation data stay out. */
export function buildViewerPresetPayload(name: string, columnFilters: readonly ColumnFilter[], numericSort: ImportDataNumericSort | null, headers: readonly string[]) {
  if (columnFilters.length === 0 && numericSort === null) return { ok: false as const, message: "Add a filter or numeric sort before saving a preset." };
  const candidate = {
    name,
    columnFilters: columnFilters.map(({ column, operator, value, valueTo }) => ({
      column, operator, value, ...(valueTo === undefined ? {} : { valueTo }),
    })),
    numericSort: numericSort ? { ...numericSort } : null,
  };
  const parsed = viewerFilterPresetCreateSchema.safeParse(candidate);
  if (!parsed.success) return { ok: false as const, message: "Complete every filter with valid values before saving a preset." };
  if (parsed.data.columnFilters.some(filter => !headers.includes(filter.column))
    || (parsed.data.numericSort && !headers.includes(parsed.data.numericSort.column))) {
    return { ok: false as const, message: "A preset column is no longer available in this file." };
  }
  return { ok: true as const, payload: parsed.data };
}

export function getViewerPresetCompatibilityIssue(preset: ViewerFilterPreset, headers: readonly string[]) {
  return preset.columnFilters.some(filter => !headers.includes(filter.column))
    || (preset.numericSort !== null && !headers.includes(preset.numericSort.column))
    ? "A preset column is no longer available in this file. Choose another preset or delete it." : null;
}
