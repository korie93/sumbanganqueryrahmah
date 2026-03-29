import fs from "node:fs";
import readline from "node:readline";
import * as xlsx from "xlsx";

type ImportRow = Record<string, string>;

type ParsedImportUploadResult = {
  headers: string[];
  rows: ImportRow[];
  error?: string;
};

function isSupportedSpreadsheet(filename: string) {
  return /\.(csv|xlsx|xls|xlsb)$/i.test(filename);
}

export function stripImportUploadExtension(filename: string) {
  return filename.replace(/\.(csv|xlsx|xls|xlsb)$/i, "");
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

function parseCsvBuffer(buffer: Buffer): ParsedImportUploadResult {
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

    const values = parseCsvLine(line);
    const row: ImportRow = {};
    headers.forEach((header, headerIndex) => {
      row[header] = values[headerIndex] || "";
    });

    if (Object.values(row).some((value) => value !== "")) {
      rows.push(row);
    }
  }

  return { headers, rows };
}

async function parseCsvFile(filePath: string): Promise<ParsedImportUploadResult> {
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

      const values = parseCsvLine(normalizedLine);
      const row: ImportRow = {};
      headers.forEach((header, headerIndex) => {
        row[header] = values[headerIndex] || "";
      });

      if (Object.values(row).some((value) => value !== "")) {
        rows.push(row);
      }
    }
  } finally {
    lineReader.close();
    stream.destroy();
  }

  if (!headerResolved || headers.length === 0) {
    return { headers: [], rows: [], error: "CSV file is empty." };
  }

  return { headers, rows };
}

function parseWorkbookJsonData(jsonData: unknown[][]): ParsedImportUploadResult {
  if (jsonData.length === 0) {
    return { headers: [], rows: [], error: "Excel file is empty." };
  }

  let headerRowIndex = 0;
  let maxNonEmptyCols = 0;

  for (let index = 0; index < Math.min(5, jsonData.length); index += 1) {
    const row = jsonData[index];
    const nonEmptyCount = row.filter((cell) => cell !== "" && cell !== null && cell !== undefined).length;
    if (nonEmptyCount > maxNonEmptyCols) {
      maxNonEmptyCols = nonEmptyCount;
      headerRowIndex = index;
    }
  }

  const headers = jsonData[headerRowIndex].map((header, index) => {
    const value = String(header || "").trim();
    return value || `Column_${index + 1}`;
  });

  const rows: ImportRow[] = [];

  for (let rowIndex = headerRowIndex + 1; rowIndex < jsonData.length; rowIndex += 1) {
    const rowData = jsonData[rowIndex];
    const hasAnyData = rowData.some((cell, index) => {
      if (index >= headers.length) return false;
      return String(cell ?? "").trim() !== "";
    });

    if (!hasAnyData) continue;

    const row: ImportRow = {};
    headers.forEach((header, index) => {
      const cellValue = rowData[index];
      row[header] = cellValue instanceof Date
        ? cellValue.toLocaleDateString("en-MY")
        : String(cellValue ?? "").trim();
    });
    rows.push(row);
  }

  return { headers, rows };
}

function parseExcelBuffer(buffer: Buffer): ParsedImportUploadResult {
  let workbook;
  try {
    workbook = xlsx.read(buffer, { type: "buffer", cellDates: true, cellNF: false, cellText: false });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to read Excel file";
    if (message.includes("password") || message.includes("encrypt")) {
      return { headers: [], rows: [], error: "File is password protected" };
    }
    if (message.includes("Unsupported") || message.includes("corrupt")) {
      return { headers: [], rows: [], error: "File is corrupted or unsupported format" };
    }
    return { headers: [], rows: [], error: message };
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { headers: [], rows: [], error: "Excel file does not have any sheets." };
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false }) as unknown[][];

  (workbook as { SheetNames?: unknown; Sheets?: unknown }).SheetNames = null;
  (workbook as { SheetNames?: unknown; Sheets?: unknown }).Sheets = null;
  workbook = null as never;

  return parseWorkbookJsonData(jsonData);
}

function parseExcelFile(filePath: string): ParsedImportUploadResult {
  let workbook;
  try {
    workbook = xlsx.readFile(filePath, { cellDates: true, cellNF: false, cellText: false });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to read Excel file";
    if (message.includes("password") || message.includes("encrypt")) {
      return { headers: [], rows: [], error: "File is password protected" };
    }
    if (message.includes("Unsupported") || message.includes("corrupt")) {
      return { headers: [], rows: [], error: "File is corrupted or unsupported format" };
    }
    return { headers: [], rows: [], error: message };
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { headers: [], rows: [], error: "Excel file does not have any sheets." };
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: "", raw: false }) as unknown[][];

  (workbook as { SheetNames?: unknown; Sheets?: unknown }).SheetNames = null;
  (workbook as { SheetNames?: unknown; Sheets?: unknown }).Sheets = null;
  workbook = null as never;

  return parseWorkbookJsonData(jsonData);
}

export function parseImportUploadBuffer(filename: string, buffer: Buffer): ParsedImportUploadResult {
  const normalizedFilename = String(filename || "").trim().toLowerCase();
  if (!isSupportedSpreadsheet(normalizedFilename)) {
    return { headers: [], rows: [], error: "Please select a CSV or Excel file (.xlsx, .xls, .xlsb)" };
  }

  if (normalizedFilename.endsWith(".csv")) {
    return parseCsvBuffer(buffer);
  }

  return parseExcelBuffer(buffer);
}

export async function parseImportUploadFile(filename: string, filePath: string): Promise<ParsedImportUploadResult> {
  const normalizedFilename = String(filename || "").trim().toLowerCase();
  if (!isSupportedSpreadsheet(normalizedFilename)) {
    return { headers: [], rows: [], error: "Please select a CSV or Excel file (.xlsx, .xls, .xlsb)" };
  }

  if (normalizedFilename.endsWith(".csv")) {
    return parseCsvFile(filePath);
  }

  return parseExcelFile(filePath);
}
