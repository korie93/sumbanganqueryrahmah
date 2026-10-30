import { z } from "zod";
import { getImportFilterValidationIssue, IMPORT_DATA_FILTER_OPERATORS, isImportFilterRangeOperator, isNumericImportFilterOperator, isDateImportFilterOperator, type ImportDataColumnFilter } from "./import-data-filters";
import { IMPORT_DATA_NUMERIC_SORT_DIRECTIONS, type ImportDataNumericSort } from "./import-data-sort";

export const VIEWER_FILTER_PRESET_MAX_PER_IMPORT = 10;
export const VIEWER_FILTER_PRESET_NAME_MAX_LENGTH = 60;
export const VIEWER_FILTER_PRESET_MAX_FILTERS = 10;

function boundedString(maximum: number) {
  return z.string().refine(value => value.length <= maximum, `Use at most ${maximum} characters.`)
    .refine(value => {
      // PostgreSQL text/jsonb cannot represent NUL or unpaired UTF-16 surrogates.
      for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        if (code === 0 || (code >= 0xdc00 && code <= 0xdfff)) return false;
        if (code >= 0xd800 && code <= 0xdbff) {
          const next = value.charCodeAt(++index);
          if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
        }
      }
      return true;
    }, "Use valid text without null characters.");
}

export const viewerFilterPresetNameSchema = boundedString(VIEWER_FILTER_PRESET_NAME_MAX_LENGTH)
  .refine(value => !Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code <= 31 || (code >= 127 && code <= 159);
  }), "Preset names cannot contain control characters.")
  .transform(value => value.trim())
  .refine(value => value.length > 0, "Enter a preset name.");

const columnSchema = boundedString(120).refine(value => value.trim() === value && value.length > 0, "Choose a valid column.");
const columnFilterSchema = z.object({
  column: columnSchema,
  operator: z.enum(IMPORT_DATA_FILTER_OPERATORS),
  value: boundedString(500),
  valueTo: boundedString(500).optional(),
}).strict().superRefine((filter, ctx) => {
  const issue = getImportFilterValidationIssue(filter);
  if (issue || !filter.value.trim()) ctx.addIssue({ code: "custom", message: issue ?? "Enter a filter value." });
  if (!isImportFilterRangeOperator(filter.operator) && filter.valueTo !== undefined) {
    ctx.addIssue({ code: "custom", message: "This operator accepts one value." });
  }
}).transform((filter): ImportDataColumnFilter => {
  const typed = isNumericImportFilterOperator(filter.operator) || isDateImportFilterOperator(filter.operator);
  return { column: filter.column, operator: filter.operator,
    value: typed ? filter.value.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "") : filter.value.trim(),
    ...(isImportFilterRangeOperator(filter.operator) ? { valueTo: (filter.valueTo ?? "").replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, "") } : {}) };
});

const numericSortSchema = z.object({ column: columnSchema, direction: z.enum(IMPORT_DATA_NUMERIC_SORT_DIRECTIONS) }).strict();

export const viewerFilterPresetCreateSchema = z.object({
  name: viewerFilterPresetNameSchema,
  columnFilters: z.array(columnFilterSchema).max(VIEWER_FILTER_PRESET_MAX_FILTERS),
  numericSort: numericSortSchema.nullable(),
}).strict().refine(value => value.columnFilters.length > 0 || value.numericSort !== null, "Add a filter or numeric sort before saving a preset.");

export const viewerFilterPresetRenameSchema = z.object({ name: viewerFilterPresetNameSchema }).strict();

export type ViewerFilterPreset = {
  id: string;
  name: string;
  columnFilters: ImportDataColumnFilter[];
  numericSort: ImportDataNumericSort | null;
};
export type ViewerFilterPresetCreateInput = z.infer<typeof viewerFilterPresetCreateSchema>;

export const viewerFilterPresetSchema = z.object({
  id: z.string().uuid(), name: viewerFilterPresetNameSchema,
  columnFilters: z.array(columnFilterSchema).max(VIEWER_FILTER_PRESET_MAX_FILTERS),
  numericSort: numericSortSchema.nullable(),
}).strict().refine(value => value.columnFilters.length > 0 || value.numericSort !== null, "Empty preset.");
export const viewerFilterPresetListResponseSchema = z.object({ presets: z.array(viewerFilterPresetSchema).max(VIEWER_FILTER_PRESET_MAX_PER_IMPORT) }).strict();
export const viewerFilterPresetResponseSchema = z.object({ preset: viewerFilterPresetSchema }).strict();
