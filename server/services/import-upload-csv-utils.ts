import fs from "node:fs";
import readline from "node:readline";
import {
  createUploadFileAccessError,
  createUploadFileTooLargeError,
  isFileAccessError,
  resolveVerifiedUploadFilePath,
  validateUploadFileSize,
} from "./import-upload-file-utils";
import type { ImportRow, ParsedImportUploadResult } from "./import-upload-types";

export const DEFAULT_IMPORT_CSV_MAX_ROWS = 100_000;
export const DEFAULT_IMPORT_CSV_MAX_MATERIALIZED_ROWS = 5_000;

type ParseCsvOptions = {
  allowedRootDir?: string;
  maxRows?: number;
  maxBytes?: number;
  maxMaterializedRows?: number;
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

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function findHeaderLine(lines: string[]) {
  let headerLineIndex = 0;
  while (headerLineIndex < lines.length && !lines[headerLineIndex].trim()) {
    headerLineIndex += 1;
  }
  return headerLineIndex;
}

function toParsedCsvRow(headers: string[], values: string[]): ImportRow {
  const row: ImportRow = {};
  headers.forEach((header, headerIndex) => {
    row[header] = values[headerIndex] || "";
  });
  return row;
}

async function walkCsvFile(
  filePath: string,
  options: ParseCsvOptions | undefined,
  onRow?: (row: ImportRow) => Promise<void> | void,
): Promise<CsvFileInspectionResult> {
  let verifiedFilePath = filePath;
  try {
    verifiedFilePath = await resolveVerifiedUploadFilePath(filePath, options?.allowedRootDir);
  } catch (error) {
    if (isFileAccessError(error)) {
      return {
        headers: [],
        rowCount: 0,
        error: createUploadFileAccessError().error ?? "Cannot access the uploaded file. Please try again.",
      };
    }
    throw error;
  }

  const sizeValidation = await validateUploadFileSize(verifiedFilePath, options?.maxBytes);
  if (sizeValidation) {
    const sizeValidationError = sizeValidation.error
      ?? createUploadFileTooLargeError().error
      ?? "The selected file is too large to import. Please split it into smaller files and try again.";
    return {
      headers: [],
      rowCount: 0,
      error: sizeValidationError,
    };
  }

  const maxRows = resolveCsvMaxRows(options);
  const stream = fs.createReadStream(verifiedFilePath, { encoding: "utf8" });
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

  try {
    for await (const rawLine of lineReader) {
      const line = String(rawLine ?? "");
      const normalizedLine = headerResolved ? line : line.replace(/^\ufeff/, "");
      if (!normalizedLine.trim()) {
        continue;
      }

      if (!headerResolved) {
        headers = parseCsvLine(normalizedLine);
        headerResolved = true;
        continue;
      }

      const row = toParsedCsvRow(headers, parseCsvLine(normalizedLine));
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
    return createUploadFileTooLargeError();
  }

  const maxRows = resolveCsvMaxRows(options);
  const materializedMaxRows = resolveCsvMaterializedMaxRows(options);
  const text = buffer.toString("utf8").replace(/^\ufeff/, "");
  const lines = text.split(/\r?\n/);

  if (lines.length === 0) {
    return { headers: [], rows: [], error: "CSV file is empty." };
  }

  const headerLineIndex = findHeaderLine(lines);
  if (headerLineIndex >= lines.length) {
    return { headers: [], rows: [], error: "CSV file is empty." };
  }

  const headers = parseCsvLine(lines[headerLineIndex]);
  const rows: ImportRow[] = [];

  for (let index = headerLineIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) continue;

    const row = toParsedCsvRow(headers, parseCsvLine(line));
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
