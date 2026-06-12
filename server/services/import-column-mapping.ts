import { z } from "zod";
import { ImportUploadValidationError } from "./import-upload-file-utils";
import { ERROR_CODES } from "../../shared/error-codes";
import type { ImportRow } from "./import-upload-types";

const FORBIDDEN_COLUMN_NAMES = new Set(["__proto__", "constructor", "prototype"]);
const MAX_COLUMN_NAME_LENGTH = 120;
const MAX_COLUMN_MAPPINGS = 300;

export const importColumnMappingEntrySchema = z.object({
  source: z.string().trim().min(1).max(MAX_COLUMN_NAME_LENGTH),
  target: z.string().trim().min(1).max(MAX_COLUMN_NAME_LENGTH).nullable(),
}).strict();

export const importColumnMappingSchema = z.array(importColumnMappingEntrySchema)
  .max(MAX_COLUMN_MAPPINGS);

export type ImportColumnMappingEntry = z.infer<typeof importColumnMappingEntrySchema>;

function throwInvalidMapping(message: string): never {
  throw new ImportUploadValidationError(message, ERROR_CODES.IMPORT_PARSE_FAILED);
}

function assertSafeColumnName(value: string, label: string): void {
  if (FORBIDDEN_COLUMN_NAMES.has(value.toLowerCase())) {
    throwInvalidMapping(`${label} contains a reserved column name.`);
  }
}

export function parseImportColumnMapping(value: unknown): ImportColumnMappingEntry[] {
  if (value == null || value === "") {
    return [];
  }

  let parsedValue = value;
  if (typeof value === "string") {
    try {
      parsedValue = JSON.parse(value);
    } catch {
      throwInvalidMapping("Column mapping must be valid JSON.");
    }
  }

  const result = importColumnMappingSchema.safeParse(parsedValue);
  if (!result.success) {
    throwInvalidMapping("Column mapping contains invalid source or target columns.");
  }

  const sourceNames = new Set<string>();
  const targetNames = new Set<string>();
  for (const entry of result.data) {
    assertSafeColumnName(entry.source, "Column mapping");
    const normalizedSource = entry.source.toLowerCase();
    if (sourceNames.has(normalizedSource)) {
      throwInvalidMapping("Column mapping contains duplicate source columns.");
    }
    sourceNames.add(normalizedSource);

    if (entry.target === null) {
      continue;
    }
    assertSafeColumnName(entry.target, "Column mapping");
    const normalizedTarget = entry.target.toLowerCase();
    if (targetNames.has(normalizedTarget)) {
      throwInvalidMapping("Column mapping target columns must be unique.");
    }
    targetNames.add(normalizedTarget);
  }

  return result.data;
}

export function validateImportColumnMappingSources(
  headers: readonly string[],
  mapping: readonly ImportColumnMappingEntry[],
): void {
  if (mapping.length === 0) {
    return;
  }

  const availableHeaders = new Set(headers.map((header) => header.toLowerCase()));
  const unknownSource = mapping.find(
    (entry) => !availableHeaders.has(entry.source.toLowerCase()),
  );
  if (unknownSource) {
    throwInvalidMapping("Column mapping references a source column that is not present in the file.");
  }
}

export function applyImportColumnMapping(
  row: ImportRow,
  mapping: readonly ImportColumnMappingEntry[],
): ImportRow {
  if (mapping.length === 0) {
    return row;
  }

  const mappingBySource = new Map(
    mapping.map((entry) => [entry.source.toLowerCase(), entry.target] as const),
  );
  const mappedRow = Object.create(null) as ImportRow;

  for (const [source, value] of Object.entries(row)) {
    const normalizedSource = source.toLowerCase();
    const target = mappingBySource.has(normalizedSource)
      ? mappingBySource.get(normalizedSource)
      : source;
    if (target !== null && target !== undefined) {
      mappedRow[target] = value;
    }
  }

  return mappedRow;
}
