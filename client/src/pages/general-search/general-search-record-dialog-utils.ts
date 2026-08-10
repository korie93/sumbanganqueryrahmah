import type { SearchResultRow } from "@/pages/general-search/types";
import {
  collectSearchHeaders,
  getCellDisplayText,
  getPriorityRank,
} from "@/pages/general-search/utils";
import { resolveSpreadsheetIdentifierKind } from "@shared/common/spreadsheet-identifier-normalization";

export type GeneralSearchRecordField = {
  header: string;
  label: string;
  value: string;
};

export type GeneralSearchRecordDialogView = {
  additionalFields: GeneralSearchRecordField[];
  contactFields: GeneralSearchRecordField[];
  emptyFields: GeneralSearchRecordField[];
  homeAddressFields: GeneralSearchRecordField[];
  identityFields: GeneralSearchRecordField[];
  officeAddressFields: GeneralSearchRecordField[];
  paymentFields: GeneralSearchRecordField[];
  sourceFields: GeneralSearchRecordField[];
  summaryFields: GeneralSearchRecordField[];
  totalFields: number;
};

const HOME_FIELD_MARKERS = [
  "alamatkediaman",
  "alamatrumah",
  "homeaddress",
  "homephone",
  "homepostcode",
  "hometelephone",
  "permanentaddress",
  "poskodrumah",
  "residentialaddress",
  "residentialpostcode",
  "telefonrumah",
] as const;

const OFFICE_FIELD_MARKERS = [
  "alamatpejabat",
  "businessaddress",
  "businessphone",
  "businesspostcode",
  "employeraddress",
  "officeaddress",
  "officephone",
  "officepostcode",
  "poskodpejabat",
  "telefonpejabat",
] as const;

const PAYMENT_DATE_HEADERS = new Set([
  "lastpaiddate",
  "lastpaymentdate",
  "tarikhbayaranterakhir",
]);

const PAYMENT_AMOUNT_HEADERS = new Set([
  "amountpaid",
  "jumlahbayaran",
  "lastpaidamount",
  "paymentamount",
]);

const EMPLOYER_NAME_HEADERS = new Set([
  "company",
  "companyname",
  "employername",
  "majikan",
  "namamajikan",
  "namasyarikat",
]);

type AddressLocalityKind = "district" | "state";

const OFFICE_CONTEXT_MARKERS = ["business", "employer", "office", "pejabat"] as const;
const HOME_CONTEXT_MARKERS = [
  "home",
  "kediaman",
  "permanent",
  "residential",
  "rumah",
] as const;

const EXCEL_SERIAL_MIN = 20_000;
const EXCEL_SERIAL_MAX = 100_000;
const EXCEL_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
const MILLISECONDS_PER_DAY = 86_400_000;

function normalizeRecordHeader(header: string): string {
  return header
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function includesMarker(header: string, markers: readonly string[]): boolean {
  const normalizedHeader = normalizeRecordHeader(header);
  return markers.some((marker) => normalizedHeader.includes(marker));
}

function tokenizeRecordHeader(header: string): Set<string> {
  return new Set(
    header
      .normalize("NFKD")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

function getAddressLocalityKind(header: string): AddressLocalityKind | null {
  const normalizedHeader = normalizeRecordHeader(header);
  const tokens = tokenizeRecordHeader(header);

  if (tokens.has("district")
    || tokens.has("daerah")
    || tokens.has("city")
    || tokens.has("town")
    || tokens.has("bandar")
    || tokens.has("mukim")
    || normalizedHeader.includes("district")
    || normalizedHeader.includes("daerah")
    || normalizedHeader.includes("postalcity")) {
    return "district";
  }

  if (tokens.has("state")
    || tokens.has("negeri")
    || normalizedHeader.includes("negeri")
    || /^(?:home|residential|permanent|office|business|employer)?state(?:name|code|desc|description)?$/.test(
      normalizedHeader,
    )) {
    return "state";
  }

  return null;
}

function hasOfficeContext(header: string): boolean {
  return includesMarker(header, OFFICE_CONTEXT_MARKERS);
}

function hasHomeContext(header: string): boolean {
  return includesMarker(header, HOME_CONTEXT_MARKERS);
}

function isHomeField(header: string): boolean {
  if (resolveSpreadsheetIdentifierKind(header) === "homePhone") return true;
  if (includesMarker(header, HOME_FIELD_MARKERS)) return true;
  return getAddressLocalityKind(header) !== null && !hasOfficeContext(header);
}

function isOfficeField(header: string): boolean {
  if (isEmployerNameField(header)) return true;
  if (resolveSpreadsheetIdentifierKind(header) === "officePhone") return true;
  if (includesMarker(header, OFFICE_FIELD_MARKERS)) return true;
  return getAddressLocalityKind(header) !== null && hasOfficeContext(header);
}

function isEmployerNameField(header: string): boolean {
  return EMPLOYER_NAME_HEADERS.has(normalizeRecordHeader(header));
}

function isCustomerPhoneField(header: string): boolean {
  return resolveSpreadsheetIdentifierKind(header) === "phone";
}

function isPaymentDateField(header: string): boolean {
  return PAYMENT_DATE_HEADERS.has(normalizeRecordHeader(header));
}

function isPaymentAmountField(header: string): boolean {
  return PAYMENT_AMOUNT_HEADERS.has(normalizeRecordHeader(header));
}

function isPaymentField(header: string): boolean {
  return isPaymentDateField(header) || isPaymentAmountField(header);
}

function getAddressLineSuffix(header: string): string {
  const lineNumber = header.match(/\d+/)?.[0];
  return lineNumber ? ` ${lineNumber}` : "";
}

function getAddressFieldRank(header: string): number {
  const normalizedHeader = normalizeRecordHeader(header);
  if (isEmployerNameField(header)) return -1;
  if (normalizedHeader.includes("address") || normalizedHeader.includes("alamat")) return 0;
  if (getAddressLocalityKind(header) === "district") return 1;
  if (getAddressLocalityKind(header) === "state") return 2;
  if (normalizedHeader.includes("postcode") || normalizedHeader.includes("poskod")) return 3;
  if (normalizedHeader.includes("phone")
    || normalizedHeader.includes("telephone")
    || normalizedHeader.includes("telefon")) {
    return 4;
  }
  return 5;
}

function sortAddressFields(fields: GeneralSearchRecordField[]): GeneralSearchRecordField[] {
  return fields.sort((left, right) => {
    const rankDifference = getAddressFieldRank(left.header) - getAddressFieldRank(right.header);
    return rankDifference || left.header.localeCompare(right.header);
  });
}

function getAddressLocalityLabel(header: string): string | null {
  const kind = getAddressLocalityKind(header);
  if (!kind) return null;

  const normalizedHeader = normalizeRecordHeader(header);
  const baseLabel = kind === "state"
    ? "Negeri"
    : normalizedHeader.includes("postaldistrict")
      ? "Daerah/bandar pos"
      : /(?:city|town|bandar|mukim)/.test(normalizedHeader)
        ? "Bandar/daerah"
        : "Daerah";
  if (hasOfficeContext(header)) return `${baseLabel} pejabat`;
  if (hasHomeContext(header)) return `${baseLabel} rumah`;
  return baseLabel;
}

function formatDateParts(year: number, month: number, day: number): string | null {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day) {
    return null;
  }

  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${String(year).padStart(4, "0")}`;
}

function formatExcelSerialDate(value: number): string | null {
  if (!Number.isFinite(value) || value < EXCEL_SERIAL_MIN || value > EXCEL_SERIAL_MAX) {
    return null;
  }

  const candidate = new Date(EXCEL_EPOCH_UTC_MS + Math.floor(value) * MILLISECONDS_PER_DAY);
  return formatDateParts(
    candidate.getUTCFullYear(),
    candidate.getUTCMonth() + 1,
    candidate.getUTCDate(),
  );
}

function formatPaymentDateValue(rawValue: unknown): string {
  const fallback = getCellDisplayText(rawValue).trim();

  if (typeof rawValue === "number") {
    return formatExcelSerialDate(rawValue) ?? fallback;
  }

  if (typeof rawValue !== "string") return fallback;

  const value = rawValue.trim();
  const isoMatch = value.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/);
  if (isoMatch) {
    return formatDateParts(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3])) ?? fallback;
  }

  const dayFirstMatch = value.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (dayFirstMatch) {
    return formatDateParts(
      Number(dayFirstMatch[3]),
      Number(dayFirstMatch[2]),
      Number(dayFirstMatch[1]),
    ) ?? fallback;
  }

  const numericValue = Number(value);
  if (/^\d{5}(?:\.\d+)?$/.test(value)) {
    return formatExcelSerialDate(numericValue) ?? fallback;
  }

  return fallback;
}

function getRecordFieldLabel(header: string): string {
  const normalizedHeader = normalizeRecordHeader(header);
  const localityLabel = getAddressLocalityLabel(header);
  const identifierKind = resolveSpreadsheetIdentifierKind(header);

  if (localityLabel) return localityLabel;
  if (isEmployerNameField(header)) return "Nama majikan";
  if (identifierKind === "phone") return "Telefon pelanggan";
  if (identifierKind === "homePhone") return "Telefon rumah";
  if (identifierKind === "officePhone") return "Telefon pejabat";

  if (normalizedHeader.includes("homeaddress")
    || normalizedHeader.includes("residentialaddress")
    || normalizedHeader.includes("alamatrumah")
    || normalizedHeader.includes("alamatkediaman")
    || normalizedHeader.includes("permanentaddress")) {
    return `Alamat rumah${getAddressLineSuffix(header)}`;
  }
  if (normalizedHeader.includes("homepostcode")
    || normalizedHeader.includes("residentialpostcode")
    || normalizedHeader.includes("poskodrumah")) {
    return "Poskod rumah";
  }
  if (normalizedHeader.includes("homephone")
    || normalizedHeader.includes("hometelephone")
    || normalizedHeader.includes("telefonrumah")) {
    return "Telefon rumah";
  }
  if (normalizedHeader.includes("officeaddress")
    || normalizedHeader.includes("businessaddress")
    || normalizedHeader.includes("employeraddress")
    || normalizedHeader.includes("alamatpejabat")) {
    return `Alamat pejabat${getAddressLineSuffix(header)}`;
  }
  if (normalizedHeader.includes("officepostcode")
    || normalizedHeader.includes("businesspostcode")
    || normalizedHeader.includes("poskodpejabat")) {
    return "Poskod pejabat";
  }
  if (normalizedHeader.includes("officephone")
    || normalizedHeader.includes("businessphone")
    || normalizedHeader.includes("telefonpejabat")) {
    return "Telefon pejabat";
  }
  if (isPaymentDateField(header)) return "Tarikh bayaran terakhir";
  if (isPaymentAmountField(header)) return "Jumlah bayaran";

  return header;
}

function buildRecordField(record: SearchResultRow, header: string): GeneralSearchRecordField {
  return {
    header,
    label: getRecordFieldLabel(header),
    value: isPaymentDateField(header)
      ? formatPaymentDateValue(record[header])
      : getCellDisplayText(record[header]),
  };
}

function hasRecordFieldValue(rawValue: unknown): boolean {
  if (rawValue === null || rawValue === undefined) return false;
  if (typeof rawValue === "string") {
    const normalized = rawValue.trim();
    return normalized !== "" && normalized !== "-";
  }
  if (Array.isArray(rawValue)) return rawValue.length > 0;
  return true;
}

function isSourceHeader(header: string): boolean {
  return header.trim().toLowerCase() === "source file";
}

export function buildGeneralSearchRecordDialogView(
  record: SearchResultRow,
  canSeeSourceFile: boolean,
): GeneralSearchRecordDialogView {
  const orderedHeaders = collectSearchHeaders([record], canSeeSourceFile);
  const sourceFields = orderedHeaders
    .filter((header) => isSourceHeader(header))
    .map((header) => buildRecordField(record, header));
  const recordHeaders = orderedHeaders.filter((header) => !isSourceHeader(header));
  const populatedFields = recordHeaders
    .filter((header) => hasRecordFieldValue(record[header]))
    .map((header) => buildRecordField(record, header));
  const emptyFields = recordHeaders
    .filter((header) => !hasRecordFieldValue(record[header]))
    .map((header) => buildRecordField(record, header));
  const summaryFields = populatedFields
    .filter(({ header }) => getPriorityRank(header) <= 2)
    .slice(0, 3);
  const summaryHeaders = new Set(summaryFields.map(({ header }) => header));
  const remainingFields = populatedFields.filter(({ header }) => !summaryHeaders.has(header));
  const paymentFields = remainingFields
    .filter(({ header }) => isPaymentField(header))
    .sort((left, right) => Number(isPaymentAmountField(left.header)) - Number(isPaymentAmountField(right.header)));
  const officeAddressFields = sortAddressFields(
    remainingFields.filter(({ header }) => isOfficeField(header)),
  );
  const officeAddressHeaders = new Set(officeAddressFields.map(({ header }) => header));
  const homeAddressFields = sortAddressFields(
    remainingFields.filter(
      ({ header }) => isHomeField(header) && !officeAddressHeaders.has(header),
    ),
  );
  const customerPhoneFields = remainingFields.filter(
    ({ header }) => isCustomerPhoneField(header),
  );
  const groupedHeaders = new Set([
    ...paymentFields.map(({ header }) => header),
    ...homeAddressFields.map(({ header }) => header),
    ...officeAddressFields.map(({ header }) => header),
    ...customerPhoneFields.map(({ header }) => header),
  ]);
  const ungroupedFields = remainingFields.filter(({ header }) => !groupedHeaders.has(header));

  return {
    additionalFields: ungroupedFields.filter(({ header }) => getPriorityRank(header) > 6),
    contactFields: ungroupedFields.filter(({ header }) => {
      const rank = getPriorityRank(header);
      return rank >= 4 && rank <= 6;
    }),
    emptyFields,
    homeAddressFields,
    identityFields: [
      ...ungroupedFields.filter(({ header }) => getPriorityRank(header) <= 3),
      ...customerPhoneFields,
    ],
    officeAddressFields,
    paymentFields,
    sourceFields,
    summaryFields,
    totalFields: orderedHeaders.length,
  };
}
