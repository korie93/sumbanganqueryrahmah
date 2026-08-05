export type SpreadsheetIdentifierKind = "malaysianIc" | "phone";

type RawCellReader = (rowIndex: number, columnIndex: number) => unknown;

const MALAYSIAN_IC_DIGITS = 12;
const HEADER_SCAN_ROWS = 5;
export const MAX_SPREADSHEET_ACCOUNT_VALUES = 8;

const MALAYSIAN_IC_HEADERS = new Set([
  "ic",
  "icno",
  "icnumber",
  "idno",
  "identitycard",
  "identitynumber",
  "kadpengenalan",
  "nric",
  "noic",
  "nokp",
  "nopengenalan",
  "nomboric",
  "nomborkp",
  "nomborpengenalan",
]);

const PHONE_HEADERS = new Set([
  "contact",
  "contactno",
  "contactnumber",
  "handphone",
  "hp",
  "mobile",
  "mobileno",
  "mobilenumber",
  "nohp",
  "notel",
  "notelefon",
  "nomborhp",
  "nombortelefon",
  "phone",
  "phoneno",
  "phonenumber",
  "tel",
  "telephone",
  "telephoneno",
  "telephonenumber",
]);

const ACCOUNT_HEADERS = new Set([
  "acc",
  "accno",
  "account",
  "accountno",
  "accountnumber",
  "acct",
  "acctno",
  "akaun",
  "cardno",
  "cardnumber",
  "noakaun",
  "nomborakaun",
  "nomborakaunbankpemohon",
]);

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function resolveSpreadsheetIdentifierKind(
  header: unknown,
): SpreadsheetIdentifierKind | null {
  const normalizedHeader = normalizeHeader(header);
  if (MALAYSIAN_IC_HEADERS.has(normalizedHeader)) {
    return "malaysianIc";
  }
  if (PHONE_HEADERS.has(normalizedHeader)) {
    return "phone";
  }
  return null;
}

export function isSpreadsheetAccountHeader(header: unknown): boolean {
  return ACCOUNT_HEADERS.has(normalizeHeader(header));
}

export function findSpreadsheetHeaderRowIndex(rows: unknown[][]) {
  let headerRowIndex = 0;
  let maxNonEmptyColumns = 0;

  for (let index = 0; index < Math.min(HEADER_SCAN_ROWS, rows.length); index += 1) {
    const nonEmptyCount = rows[index].filter(
      (cell) => cell !== "" && cell !== null && cell !== undefined,
    ).length;
    if (nonEmptyCount > maxNonEmptyColumns) {
      maxNonEmptyColumns = nonEmptyCount;
      headerRowIndex = index;
    }
  }

  return headerRowIndex;
}

export function normalizeSpreadsheetIdentifierValue(
  value: unknown,
  kind: SpreadsheetIdentifierKind,
  formattedValue?: unknown,
): string | null {
  if (
    typeof value !== "number"
    || !Number.isSafeInteger(value)
    || value < 0
  ) {
    return null;
  }

  const formattedDigits = String(formattedValue ?? "").trim();
  if (/^\d+$/.test(formattedDigits)) {
    if (kind === "phone") {
      return formattedDigits;
    }
    if (formattedDigits.length === MALAYSIAN_IC_DIGITS) {
      return formattedDigits;
    }
  }

  const digits = value.toFixed(0);
  if (kind === "malaysianIc" && digits.length < MALAYSIAN_IC_DIGITS) {
    return digits.padStart(MALAYSIAN_IC_DIGITS, "0");
  }

  return digits;
}

export function normalizeSpreadsheetIdentifierCells(
  rows: unknown[][],
  readRawCell: RawCellReader,
) {
  if (rows.length === 0) {
    return 0;
  }

  const headerRowIndex = findSpreadsheetHeaderRowIndex(rows);
  const identifierColumns = rows[headerRowIndex]
    .map((header, columnIndex) => ({
      columnIndex,
      kind: resolveSpreadsheetIdentifierKind(header),
    }))
    .filter(
      (
        column,
      ): column is { columnIndex: number; kind: SpreadsheetIdentifierKind } =>
        column.kind !== null,
    );

  let normalizedCellCount = 0;
  for (let rowIndex = headerRowIndex + 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    for (const { columnIndex, kind } of identifierColumns) {
      const normalizedValue = normalizeSpreadsheetIdentifierValue(
        readRawCell(rowIndex, columnIndex),
        kind,
        row[columnIndex],
      );
      if (normalizedValue === null) {
        continue;
      }

      if (row[columnIndex] !== normalizedValue) {
        row[columnIndex] = normalizedValue;
        normalizedCellCount += 1;
      }
    }
  }

  return normalizedCellCount;
}
