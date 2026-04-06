import fs from "node:fs";
import readline from "node:readline";
import {
  createUploadFileAccessError,
  isFileAccessError,
} from "./import-upload-file-utils";
import type { ImportRow, ParsedImportUploadResult } from "./import-upload-types";

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

export function parseCsvBuffer(buffer: Buffer): ParsedImportUploadResult {
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
      rows.push(row);
    }
  }

  return { headers, rows };
}

export async function parseCsvFile(filePath: string): Promise<ParsedImportUploadResult> {
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const lineReader = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });

  const rows: ImportRow[] = [];
  let headers: string[] = [];
  let headerResolved = false;

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
        rows.push(row);
      }
    }
  } catch (error) {
    if (isFileAccessError(error)) {
      return createUploadFileAccessError();
    }
    throw error;
  } finally {
    lineReader.close();
    stream.destroy();
  }

  if (!headerResolved || headers.length === 0) {
    return { headers: [], rows: [], error: "CSV file is empty." };
  }

  return { headers, rows };
}
