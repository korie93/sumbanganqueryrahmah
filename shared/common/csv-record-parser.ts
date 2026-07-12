export const CSV_DUPLICATE_HEADER_ERROR =
  "CSV import contains duplicate column headers. Rename each column so every header is unique.";
export const CSV_EMPTY_HEADER_ERROR =
  "CSV import contains an empty column header. Add a unique name to every column.";
export const CSV_ROW_WIDTH_ERROR =
  "CSV import contains a row with more values than column headers. Fix the row or add the missing headers.";
export const CSV_UNTERMINATED_QUOTED_FIELD_ERROR =
  "CSV import contains an unterminated quoted field. Close every quoted value and try again.";

function scanCsvQuoteState(value: string, initialState: boolean): boolean {
  let inQuotes = initialState;

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '"') {
      continue;
    }

    if (inQuotes && value[index + 1] === '"') {
      index += 1;
      continue;
    }

    inQuotes = !inQuotes;
  }

  return inQuotes;
}

export class CsvLogicalRecordAccumulator {
  private logicalRecord = "";
  private inQuotes = false;
  private hasInput = false;

  get pendingLength(): number {
    return this.logicalRecord.length;
  }

  appendPhysicalLine(line: string): string | null {
    if (this.hasInput) {
      this.logicalRecord += "\n";
    }

    this.logicalRecord += line;
    this.hasInput = true;
    this.inQuotes = scanCsvQuoteState(line, this.inQuotes);

    if (this.inQuotes) {
      return null;
    }

    return this.takeRecord();
  }

  finish(): { record: string | null; error: string | null } {
    if (!this.hasInput) {
      return { record: null, error: null };
    }

    if (this.inQuotes) {
      this.reset();
      return { record: null, error: CSV_UNTERMINATED_QUOTED_FIELD_ERROR };
    }

    return { record: this.takeRecord(), error: null };
  }

  private takeRecord(): string {
    const record = this.logicalRecord;
    this.reset();
    return record;
  }

  private reset(): void {
    this.logicalRecord = "";
    this.inQuotes = false;
    this.hasInput = false;
  }
}

export function parseCsvRecord(record: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < record.length; index += 1) {
    const char = record[index];
    if (char === '"') {
      if (inQuotes && record[index + 1] === '"') {
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

export function validateCsvHeaders(headers: readonly string[]): string | null {
  const normalizedHeaders = headers.map((header) => header.trim().toLowerCase());
  if (normalizedHeaders.some((header) => header.length === 0)) {
    return CSV_EMPTY_HEADER_ERROR;
  }

  if (new Set(normalizedHeaders).size !== normalizedHeaders.length) {
    return CSV_DUPLICATE_HEADER_ERROR;
  }

  return null;
}

export function validateCsvRowWidth(
  headers: readonly string[],
  values: readonly string[],
): string | null {
  return values.length > headers.length ? CSV_ROW_WIDTH_ERROR : null;
}
