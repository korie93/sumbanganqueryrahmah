import fs from "node:fs";
import readline from "node:readline";
import {
  createUploadFileAccessError,
  isFileAccessError,
} from "./import-upload-file-utils";
import type { ImportRow, ParsedImportUploadResult } from "./import-upload-types";

export const DEFAULT_IMPORT_CSV_MAX_ROWS = 100_000;

type ParseCsvOptions = {
  maxRows?: number;
};

type ReadlineErrorEmitter = {
  once(event: "error", listener: (error: Error) => void): unknown;
  off(event: "error", listener: (error: Error) => void): unknown;
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

export function parseCsvBuffer(buffer: Buffer, options?: ParseCsvOptions): ParsedImportUploadResult {
  const maxRows = resolveCsvMaxRows(options);
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
      rows.push(row);
    }
  }

  return { headers, rows };
}

export async function parseCsvFile(filePath: string, options?: ParseCsvOptions): Promise<ParsedImportUploadResult> {
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

  const rows: ImportRow[] = [];
  let headers: string[] = [];
  let headerResolved = false;
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
        if (rows.length >= maxRows) {
          rowLimitExceeded = true;
          closeLineReaderSafely();
          destroyStreamSafely();
          break;
        }
        rows.push(row);
      }
    }

    if (pendingReaderError) {
      throw pendingReaderError;
    }
  } catch (error) {
    if (isFileAccessError(error)) {
      return createUploadFileAccessError();
    }
    throw error;
  } finally {
    stream.off("error", handleReaderError);
    lineReaderErrorEmitter.off("error", handleReaderError);
    closeLineReaderSafely();
    destroyStreamSafely();
  }

  if (!headerResolved || headers.length === 0) {
    return { headers: [], rows: [], error: "CSV file is empty." };
  }

  if (rowLimitExceeded) {
    return createCsvRowLimitError(maxRows);
  }

  return { headers, rows };
}
