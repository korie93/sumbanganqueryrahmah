import fs from "node:fs";
import readline from "node:readline";
import {
  CsvLogicalRecordAccumulator,
  parseCsvRecord,
  validateCsvHeaders,
  validateCsvRowWidth,
} from "../../shared/common/csv-record-parser";
import {
  createUploadFileAccessError,
  createUploadFileTooLargeError,
  isFileAccessError,
  validateUploadFileSize,
} from "./import-upload-file-utils";
import type { ImportRow, ParsedImportUploadResult } from "./import-upload-types";

export const DEFAULT_IMPORT_CSV_MAX_ROWS = 100_000;
export const DEFAULT_IMPORT_CSV_MAX_MATERIALIZED_ROWS = 5_000;
export const DEFAULT_IMPORT_MAX_COLUMNS = 300;
export const DEFAULT_IMPORT_MAX_CELL_LENGTH = 5_000;

type ParseCsvOptions = {
  maxRows?: number;
  maxBytes?: number;
  maxMaterializedRows?: number;
  maxColumns?: number;
  maxCellLength?: number;
};

type ReadlineErrorEmitter = {
  once(event: "error", listener: (error: Error) => void): unknown;
  off(event: "error", listener: (error: Error) => void): unknown;
};

export type CsvFileInspectionResult = {
  headers: string[];
  rowCount: number;
  error?: string;
};

function resolveCsvMaxRows(options?: ParseCsvOptions) {
  const value = options?.maxRows;
  if (value == null || !Number.isFinite(value)) {
    return DEFAULT_IMPORT_CSV_MAX_ROWS;
  }

  return Math.max(1, Math.trunc(value));
}

function resolveCsvMaxColumns(options?: ParseCsvOptions) {
  const value = options?.maxColumns;
  if (value == null || !Number.isFinite(value)) {
    return DEFAULT_IMPORT_MAX_COLUMNS;
  }

  return Math.max(1, Math.trunc(value));
}

function resolveCsvMaxCellLength(options?: ParseCsvOptions) {
  const value = options?.maxCellLength;
  if (value == null || !Number.isFinite(value)) {
    return DEFAULT_IMPORT_MAX_CELL_LENGTH;
  }

  return Math.max(1, Math.trunc(value));
}

function createCsvCellLengthError(maxCellLength: number) {
  return `CSV import contains a cell longer than the configured ${maxCellLength.toLocaleString("en-US")} character limit.`;
}

function validateCsvValues(values: string[], options?: ParseCsvOptions): string | null {
  const maxColumns = resolveCsvMaxColumns(options);
  if (values.length > maxColumns) {
    return `CSV import exceeds the configured column limit of ${maxColumns.toLocaleString("en-US")} columns.`;
  }

  const maxCellLength = resolveCsvMaxCellLength(options);
  if (values.some((value) => value.length > maxCellLength)) {
    return createCsvCellLengthError(maxCellLength);
  }

  return null;
}

function validateCsvHeaderValues(headers: string[], options?: ParseCsvOptions): string | null {
  return validateCsvValues(headers, options) ?? validateCsvHeaders(headers);
}

function validateCsvRowValues(
  headers: string[],
  values: string[],
  options?: ParseCsvOptions,
): string | null {
  return validateCsvValues(values, options) ?? validateCsvRowWidth(headers, values);
}

function resolveCsvMaxLogicalRecordLength(options?: ParseCsvOptions): number {
  const maxColumns = resolveCsvMaxColumns(options);
  const maxCellLength = resolveCsvMaxCellLength(options);
  return maxColumns * ((maxCellLength * 2) + 3);
}

function createCsvRowLimitError(maxRows: number): ParsedImportUploadResult {
  return {
    headers: [],
    rows: [],
    error: `CSV import exceeds the configured row limit of ${maxRows.toLocaleString("en-US")} rows. Split the file into smaller uploads.`,
  };
}

function createCsvMaterializationLimitError(maxRows: number): ParsedImportUploadResult {
  return {
    headers: [],
    rows: [],
    error: `CSV import exceeds the in-memory materialization safety limit of ${maxRows.toLocaleString("en-US")} rows. Use the staged multipart import flow for larger files.`,
  };
}

function resolveCsvMaterializedMaxRows(options?: ParseCsvOptions) {
  const configuredMaxRows = resolveCsvMaxRows(options);
  const requestedMaterializedLimit = options?.maxMaterializedRows;
  const materializedLimit = requestedMaterializedLimit == null || !Number.isFinite(requestedMaterializedLimit)
    ? DEFAULT_IMPORT_CSV_MAX_MATERIALIZED_ROWS
    : Math.max(1, Math.trunc(requestedMaterializedLimit));

  return Math.min(configuredMaxRows, materializedLimit);
}

function toParsedCsvRow(headers: string[], values: string[]): ImportRow {
  const row: ImportRow = {};
  headers.forEach((header, headerIndex) => {
    row[header] = values[headerIndex] ?? "";
  });
  return row;
}

async function walkCsvFile(
  filePath: string,
  options: ParseCsvOptions | undefined,
  onRow?: (row: ImportRow) => Promise<void> | void,
): Promise<CsvFileInspectionResult> {
  const sizeValidation = await validateUploadFileSize(filePath, options?.maxBytes);
  if (sizeValidation) {
    const sizeValidationError = sizeValidation.error
      ?? createUploadFileTooLargeError(options?.maxBytes).error
      ?? "The selected file is too large to import. Please split it into smaller files and try again.";
    return {
      headers: [],
      rowCount: 0,
      error: sizeValidationError,
    };
  }

  const maxRows = resolveCsvMaxRows(options);
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const lineReader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });
  const lineReaderErrorEmitter = lineReader as unknown as ReadlineErrorEmitter;
  let pendingReaderError: unknown = null;

  const closeLineReaderSafely = () => {
    try {
      lineReader.close();
    } catch (error) {
      if (!pendingReaderError) {
        pendingReaderError = error;
      }
    }
  };

  const destroyStreamSafely = () => {
    try {
      stream.destroy();
    } catch (error) {
      if (!pendingReaderError) {
        pendingReaderError = error;
      }
    }
  };

  const handleReaderError = (error: Error) => {
    if (!pendingReaderError) {
      pendingReaderError = error;
    }
    closeLineReaderSafely();
    destroyStreamSafely();
  };
  stream.once("error", handleReaderError);
  lineReaderErrorEmitter.once("error", handleReaderError);

  let headers: string[] = [];
  let headerResolved = false;
  let rowCount = 0;
  let rowLimitExceeded = false;
  let structureError: string | null = null;
  const recordAccumulator = new CsvLogicalRecordAccumulator();
  const maxLogicalRecordLength = resolveCsvMaxLogicalRecordLength(options);

  try {
    for await (const rawLine of lineReader) {
      const line = String(rawLine ?? "");
      const normalizedLine = headerResolved ? line : line.replace(/^\ufeff/, "");
      const logicalRecord = recordAccumulator.appendPhysicalLine(normalizedLine);
      if (logicalRecord === null) {
        if (recordAccumulator.pendingLength > maxLogicalRecordLength) {
          structureError = createCsvCellLengthError(resolveCsvMaxCellLength(options));
          closeLineReaderSafely();
          destroyStreamSafely();
          break;
        }
        continue;
      }

      if (!logicalRecord.trim()) {
        continue;
      }

      if (!headerResolved) {
        headers = parseCsvRecord(logicalRecord);
        structureError = validateCsvHeaderValues(headers, options);
        if (structureError) {
          closeLineReaderSafely();
          destroyStreamSafely();
          break;
        }
        headerResolved = true;
        continue;
      }

      const values = parseCsvRecord(logicalRecord);
      structureError = validateCsvRowValues(headers, values, options);
      if (structureError) {
        closeLineReaderSafely();
        destroyStreamSafely();
        break;
      }
      const row = toParsedCsvRow(headers, values);
      if (Object.values(row).some((value) => value !== "")) {
        if (rowCount >= maxRows) {
          rowLimitExceeded = true;
          closeLineReaderSafely();
          destroyStreamSafely();
          break;
        }

        rowCount += 1;
        await onRow?.(row);
      }
    }

    if (!structureError) {
      structureError = recordAccumulator.finish().error;
    }

    if (pendingReaderError) {
      throw pendingReaderError;
    }
  } catch (error) {
    if (isFileAccessError(error)) {
      const fileAccessError = createUploadFileAccessError().error ?? "Cannot access the uploaded file. Please try again.";
      return {
        headers: [],
        rowCount: 0,
        error: fileAccessError,
      };
    }
    throw error;
  } finally {
    stream.off("error", handleReaderError);
    lineReaderErrorEmitter.off("error", handleReaderError);
    closeLineReaderSafely();
    destroyStreamSafely();
  }

  if (structureError) {
    return { headers: [], rowCount, error: structureError };
  }

  if (!headerResolved || headers.length === 0) {
    return { headers: [], rowCount: 0, error: "CSV file is empty." };
  }

  if (rowLimitExceeded) {
    const rowLimitError = createCsvRowLimitError(maxRows).error
      ?? `CSV import exceeds the configured row limit of ${maxRows.toLocaleString("en-US")} rows. Split the file into smaller uploads.`;
    return { headers: [], rowCount: rowCount, error: rowLimitError };
  }

  return { headers, rowCount };
}

export function parseCsvBuffer(buffer: Buffer, options?: ParseCsvOptions): ParsedImportUploadResult {
  if (Number.isFinite(options?.maxBytes) && (options?.maxBytes as number) > 0 && buffer.length > (options?.maxBytes as number)) {
    return createUploadFileTooLargeError(options?.maxBytes);
  }

  const maxRows = resolveCsvMaxRows(options);
  const materializedMaxRows = resolveCsvMaterializedMaxRows(options);
  const text = buffer.toString("utf8").replace(/^\ufeff/, "");
  const lines = text.split(/\r\n|\n|\r/);
  const recordAccumulator = new CsvLogicalRecordAccumulator();
  const maxLogicalRecordLength = resolveCsvMaxLogicalRecordLength(options);
  let headers: string[] | null = null;
  const rows: ImportRow[] = [];

  for (const line of lines) {
    const logicalRecord = recordAccumulator.appendPhysicalLine(line);
    if (logicalRecord === null) {
      if (recordAccumulator.pendingLength > maxLogicalRecordLength) {
        return { headers: [], rows: [], error: createCsvCellLengthError(resolveCsvMaxCellLength(options)) };
      }
      continue;
    }

    if (!logicalRecord.trim()) {
      continue;
    }

    const values = parseCsvRecord(logicalRecord);
    if (!headers) {
      const headerValidationError = validateCsvHeaderValues(values, options);
      if (headerValidationError) {
        return { headers: [], rows: [], error: headerValidationError };
      }
      headers = values;
      continue;
    }

    const rowValidationError = validateCsvRowValues(headers, values, options);
    if (rowValidationError) {
      return { headers: [], rows: [], error: rowValidationError };
    }
    const row = toParsedCsvRow(headers, values);
    if (Object.values(row).some((value) => value !== "")) {
      if (rows.length >= maxRows) {
        return createCsvRowLimitError(maxRows);
      }
      if (rows.length >= materializedMaxRows) {
        return createCsvMaterializationLimitError(materializedMaxRows);
      }
      rows.push(row);
    }
  }

  const finalRecord = recordAccumulator.finish();
  if (finalRecord.error) {
    return { headers: [], rows: [], error: finalRecord.error };
  }

  if (!headers) {
    return { headers: [], rows: [], error: "CSV file is empty." };
  }

  return { headers, rows };
}

export async function inspectCsvFile(
  filePath: string,
  options?: ParseCsvOptions,
): Promise<CsvFileInspectionResult> {
  return walkCsvFile(filePath, options);
}

export async function forEachCsvFileRow(
  filePath: string,
  onRow: (row: ImportRow) => Promise<void> | void,
  options?: ParseCsvOptions,
): Promise<CsvFileInspectionResult> {
  return walkCsvFile(filePath, options, onRow);
}

export async function parseCsvFile(filePath: string, options?: ParseCsvOptions): Promise<ParsedImportUploadResult> {
  const rows: ImportRow[] = [];
  const maxRows = resolveCsvMaterializedMaxRows(options);

  let result;
  try {
    result = await walkCsvFile(filePath, options, (row) => {
      if (rows.length >= maxRows) {
        throw new Error(
          createCsvMaterializationLimitError(maxRows).error
            ?? `CSV import exceeds the in-memory materialization safety limit of ${maxRows.toLocaleString("en-US")} rows.`,
        );
      }
      rows.push(row);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to parse CSV file.";
    if (/in-memory materialization safety limit/i.test(message)) {
      return {
        headers: [],
        rows: [],
        error: message,
      };
    }
    throw error;
  }

  if (result.error) {
    return { headers: [], rows: [], error: result.error };
  }

  return { headers: result.headers, rows };
}
