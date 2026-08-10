import { restoreMissingMalaysianMobilePrefix } from "./malaysian-phone";

export type SpreadsheetIdentifierKind =
  | "malaysianIc"
  | "phone"
  | "homePhone"
  | "officePhone";

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
  "cellphone",
  "cellphoneno",
  "contact",
  "contactno",
  "contactnumber",
  "contactphone",
  "contactphoneno",
  "customerphone",
  "customerphoneno",
  "customerphonenumber",
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
  "nombortelefonbimbit",
  "phone",
  "phoneno",
  "phonenumber",
  "tel",
  "telefonbimbit",
  "telephone",
  "telephoneno",
  "telephonenumber",
  "notelefonbimbit",
]);

const HOME_PHONE_HEADERS = new Set([
  "homephone",
  "homephoneno",
  "homephonenumber",
  "hometel",
  "hometelno",
  "hometelephone",
  "hometelephoneno",
  "hometelephonenumber",
  "notelefonrumah",
  "nombortelefonrumah",
  "residentialphone",
  "residentialphoneno",
  "telefonrumah",
  "telrumah",
]);

const OFFICE_PHONE_HEADERS = new Set([
  "businessphone",
  "businessphoneno",
  "businessphonenumber",
  "businesstel",
  "businesstelephone",
  "companyphone",
  "companytel",
  "employerphone",
  "employertel",
  "notelefonpejabat",
  "nombortelefonpejabat",
  "officephone",
  "officephoneno",
  "officephonenumber",
  "officetel",
  "officetelno",
  "officetelephone",
  "officetelephoneno",
  "officetelephonenumber",
  "phoneoffice",
  "telefonpejabat",
  "telpejabat",
  "workphone",
  "workphoneno",
  "worktel",
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

const PHONE_TOKEN = "(?:phone|telephone|telefon|tel|mobile|handphone|hp)";
const PHONE_SUFFIX = "(?:no|number)?\\d*";
const OFFICE_PHONE_HEADER_PATTERNS = [
  new RegExp(`^(?:business|company|employer|office|pejabat|work)${PHONE_TOKEN}${PHONE_SUFFIX}$`),
  new RegExp(`^(?:no|nombor)?${PHONE_TOKEN}(?:business|company|employer|office|pejabat|work)\\d*$`),
];
const HOME_PHONE_HEADER_PATTERNS = [
  new RegExp(`^(?:home|kediaman|residential|rumah)${PHONE_TOKEN}${PHONE_SUFFIX}$`),
  new RegExp(`^(?:no|nombor)?${PHONE_TOKEN}(?:home|kediaman|residential|rumah)\\d*$`),
];
const CUSTOMER_PHONE_HEADER_PATTERNS = [
  new RegExp(`^(?:(?:customer|contact|primary|pelanggan))?${PHONE_TOKEN}${PHONE_SUFFIX}$`),
  new RegExp(`^(?:no|nombor)${PHONE_TOKEN}(?:bimbit|customer|pelanggan)?\\d*$`),
];

function matchesPhoneHeader(
  normalizedHeader: string,
  context: "customer" | "home" | "office",
): boolean {
  const patterns = context === "office"
    ? OFFICE_PHONE_HEADER_PATTERNS
    : context === "home"
      ? HOME_PHONE_HEADER_PATTERNS
      : CUSTOMER_PHONE_HEADER_PATTERNS;
  return patterns.some((pattern) => pattern.test(normalizedHeader));
}

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
  if (OFFICE_PHONE_HEADERS.has(normalizedHeader) || matchesPhoneHeader(normalizedHeader, "office")) {
    return "officePhone";
  }
  if (HOME_PHONE_HEADERS.has(normalizedHeader) || matchesPhoneHeader(normalizedHeader, "home")) {
    return "homePhone";
  }
  if (PHONE_HEADERS.has(normalizedHeader) || matchesPhoneHeader(normalizedHeader, "customer")) {
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
    if (kind !== "malaysianIc") {
      return restoreMissingMalaysianMobilePrefix(formattedDigits);
    }
    if (formattedDigits.length === MALAYSIAN_IC_DIGITS) {
      return formattedDigits;
    }
  }

  const digits = value.toFixed(0);
  if (kind === "malaysianIc" && digits.length < MALAYSIAN_IC_DIGITS) {
    return digits.padStart(MALAYSIAN_IC_DIGITS, "0");
  }

  if (kind !== "malaysianIc") {
    return restoreMissingMalaysianMobilePrefix(digits);
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
