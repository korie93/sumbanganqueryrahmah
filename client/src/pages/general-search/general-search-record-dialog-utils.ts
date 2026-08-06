import type { SearchResultRow } from "@/pages/general-search/types";
import {
  collectSearchHeaders,
  getCellDisplayText,
  getPriorityRank,
} from "@/pages/general-search/utils";

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

function isHomeField(header: string): boolean {
  return includesMarker(header, HOME_FIELD_MARKERS);
}

function isOfficeField(header: string): boolean {
  return includesMarker(header, OFFICE_FIELD_MARKERS);
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

function getRecordFieldLabel(header: string): string {
  const normalizedHeader = normalizeRecordHeader(header);

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
    value: getCellDisplayText(record[header]),
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
  const officeAddressFields = remainingFields.filter(({ header }) => isOfficeField(header));
  const officeAddressHeaders = new Set(officeAddressFields.map(({ header }) => header));
  const homeAddressFields = remainingFields.filter(
    ({ header }) => isHomeField(header) && !officeAddressHeaders.has(header),
  );
  const groupedHeaders = new Set([
    ...paymentFields.map(({ header }) => header),
    ...homeAddressFields.map(({ header }) => header),
    ...officeAddressFields.map(({ header }) => header),
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
    identityFields: ungroupedFields.filter(({ header }) => getPriorityRank(header) <= 3),
    officeAddressFields,
    paymentFields,
    sourceFields,
    summaryFields,
    totalFields: orderedHeaders.length,
  };
}
