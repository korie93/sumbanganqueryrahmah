import { normalizeCollectionPiiSearchValue } from "./collection-pii-encryption-normalize";
import {
  isSpreadsheetAccountHeader,
  isUnsafeNumericSpreadsheetAccountIdentifier,
  MAX_SPREADSHEET_ACCOUNT_VALUES,
  resolveSpreadsheetIdentifierKind,
} from "../../shared/common/spreadsheet-identifier-normalization";
import type {
  SavedCollectionMatchField,
  SavedCollectionSourceCandidate,
  SavedCollectionSourceLookup,
  SavedCollectionSourceMatch,
} from "../repositories/search-repository-types";
import {
  formatCollectionAmountFromCents,
  parseCollectionAmountToCents,
} from "../../shared/collection-amount-types";
import {
  buildCollectionCallingWindow,
  parseSavedCallingDate,
} from "./collection-calling-window";

const MAX_ROW_FIELDS = 200;
const MAX_FIELD_VALUE_LENGTH = 256;
const MAX_LOOKUP_TERMS = 8;
export const MAX_SAVED_COLLECTION_SOURCE_MATCHES = 25;

const NAME_HEADERS = new Set([
  "customer",
  "customername",
  "debtor",
  "debtorname",
  "fullname",
  "name",
  "nama",
  "namapelanggan",
]);

const TOTAL_DUE_HEADERS = new Set([
  "amountdue",
  "currenttotaldue",
  "jumlahtertunggak",
  "outstandingamount",
  "totalamountdue",
  "totalamountduetotaldue",
  "totaldue",
  "totaloutstanding",
]);

const BILLING_PRINCIPAL_OSP_HEADERS = new Set([
  "billingosp",
  "billingprincipal",
  "billingprincipalosp",
  "osp",
  "outstandingprincipal",
  "principalosp",
]);

// These canonical headers intentionally stay separate. Some source files carry
// both Account No and Card No, and one must never silently replace the other.
const ACCOUNT_NUMBER_CANONICAL_HEADERS = new Set([
  "account",
  "accountno",
  "accountnumber",
  "acct",
  "acctno",
  "akaun",
  "noakaun",
  "nomborakaun",
  "nomborakaunbankpemohon",
]);

const CARD_NUMBER_CANONICAL_HEADERS = new Set([
  "cardno",
  "cardnumber",
  "nocard",
  "nomborkad",
]);

const TOTAL_OSB_HEADERS = new Set([
  "totalosb",
  "totalosbstatementclosingbalance",
  "statementclosingbalance",
]);

const AGING_STATUS_HEADERS = new Set([
  "dcsts",
  "dcstatus",
  "delinquencystatusdcsts",
  "aging",
  "agingbucket",
]);

const CALLING_DATE_HEADERS = new Set([
  "calldate",
  "callingdate",
  "callingdt",
  "tarikhcalling",
  "tarikhpanggilan",
]);

type NormalizedSavedLookup = {
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
};

type NormalizedSavedIdentity = Omit<NormalizedSavedLookup, "accountNumber"> & {
  accountNumbers: string[];
};

type SavedCollectionFinancials = {
  billingPrincipalOsp: string | null;
  callingDate: string | null;
  callingWindowEnd: string | null;
  callingWindowEndExclusive: string | null;
  totalDue: string | null;
};

export type CanonicalSavedCollectionMasterRow = {
  accountNumber: string | null;
  cardNumber: string | null;
  totalDue: string | null;
  billingPrincipalOsp: string | null;
  totalOsb: string | null;
  agingBucket: "D3" | "D4" | "D5" | "D6" | null;
  callingDate: string | null;
  callingWindowEnd: string | null;
  callingWindowEndExclusive: string | null;
};

export type CanonicalSavedCollectionCompatibilityIssue =
  | "missing_account_or_card"
  | "invalid_account_or_card"
  | "missing_total_due"
  | "invalid_total_due"
  | "missing_billing_principal_osp"
  | "invalid_billing_principal_osp"
  | "missing_dc_sts"
  | "invalid_dc_sts"
  | "missing_calling_date"
  | "invalid_calling_date";

export type CanonicalSavedCollectionCompatibility = {
  compatible: boolean;
  issues: CanonicalSavedCollectionCompatibilityIssue[];
  row: CanonicalSavedCollectionMasterRow;
};

function normalizeHeader(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function readBoundedScalar(value: unknown): string {
  if (typeof value === "string") {
    return value.slice(0, MAX_FIELD_VALUE_LENGTH);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value).slice(0, MAX_FIELD_VALUE_LENGTH);
  }
  if (typeof value === "bigint") {
    return String(value).slice(0, MAX_FIELD_VALUE_LENGTH);
  }
  return "";
}

function parseSavedCollectionMoney(
  value: unknown,
  options: { allowZero?: boolean } = {},
): string | null {
  const scalar = readBoundedScalar(value).trim();
  if (!scalar) return null;

  const normalized = scalar
    .replace(/^rm\s*/i, "")
    .replace(/\s+/g, "")
    .replace(/,/g, "");
  const cents = parseCollectionAmountToCents(normalized, {
    allowZero: options.allowZero ?? true,
  });
  return cents === null ? null : formatCollectionAmountFromCents(cents);
}

function parseCanonicalSavedIdentifier(value: unknown): string | null {
  if (isUnsafeNumericSpreadsheetAccountIdentifier(value)) {
    return null;
  }

  const scalar = readBoundedScalar(value).trim();
  if (!scalar || /^[+-]?(?:\d+\.?\d*|\.\d+)[eE][+-]?\d+$/.test(scalar)) {
    return null;
  }
  return scalar;
}

export function extractSavedCollectionFinancials(value: unknown): SavedCollectionFinancials {
  const financials: SavedCollectionFinancials = {
    billingPrincipalOsp: null,
    callingDate: null,
    callingWindowEnd: null,
    callingWindowEndExclusive: null,
    totalDue: null,
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return financials;
  }

  for (const [header, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, MAX_ROW_FIELDS)) {
    const normalizedHeader = normalizeHeader(header);
    if (financials.totalDue === null && TOTAL_DUE_HEADERS.has(normalizedHeader)) {
      financials.totalDue = parseSavedCollectionMoney(rawValue, { allowZero: false });
    }
    if (
      financials.billingPrincipalOsp === null
      && BILLING_PRINCIPAL_OSP_HEADERS.has(normalizedHeader)
    ) {
      financials.billingPrincipalOsp = parseSavedCollectionMoney(rawValue);
    }
    if (financials.callingDate === null && CALLING_DATE_HEADERS.has(normalizedHeader)) {
      const callingDate = parseSavedCallingDate(rawValue);
      const window = callingDate ? buildCollectionCallingWindow(callingDate) : null;
      financials.callingDate = window?.start ?? null;
      financials.callingWindowEnd = window?.endInclusive ?? null;
      financials.callingWindowEndExclusive = window?.endExclusive ?? null;
    }
    if (
      financials.totalDue !== null
      && financials.billingPrincipalOsp !== null
      && financials.callingDate !== null
    ) {
      break;
    }
  }

  return financials;
}

function normalizeCanonicalAgingBucket(value: unknown): CanonicalSavedCollectionMasterRow["agingBucket"] {
  const normalized = readBoundedScalar(value).trim().toUpperCase();
  const prefixed = /^[3-6]$/.test(normalized) ? `D${normalized}` : normalized;
  return prefixed === "D3"
    || prefixed === "D4"
    || prefixed === "D5"
    || prefixed === "D6"
    ? prefixed
    : null;
}

/**
 * Extract the small, non-PII contract surface required by collection matching.
 * Account/Card identifiers remain bounded strings so leading zeroes and 16
 * digit values are not coerced through JavaScript Number.
 */
export function extractCanonicalSavedCollectionMasterRow(
  value: unknown,
): CanonicalSavedCollectionMasterRow {
  const row: CanonicalSavedCollectionMasterRow = {
    accountNumber: null,
    cardNumber: null,
    totalDue: null,
    billingPrincipalOsp: null,
    totalOsb: null,
    agingBucket: null,
    callingDate: null,
    callingWindowEnd: null,
    callingWindowEndExclusive: null,
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return row;
  }

  for (const [header, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, MAX_ROW_FIELDS)) {
    const normalizedHeader = normalizeHeader(header);
    if (row.accountNumber === null && ACCOUNT_NUMBER_CANONICAL_HEADERS.has(normalizedHeader)) {
      row.accountNumber = parseCanonicalSavedIdentifier(rawValue);
    }
    if (row.cardNumber === null && CARD_NUMBER_CANONICAL_HEADERS.has(normalizedHeader)) {
      row.cardNumber = parseCanonicalSavedIdentifier(rawValue);
    }
    if (row.totalDue === null && TOTAL_DUE_HEADERS.has(normalizedHeader)) {
      row.totalDue = parseSavedCollectionMoney(rawValue, { allowZero: false });
    }
    if (
      row.billingPrincipalOsp === null
      && BILLING_PRINCIPAL_OSP_HEADERS.has(normalizedHeader)
    ) {
      row.billingPrincipalOsp = parseSavedCollectionMoney(rawValue);
    }
    if (row.totalOsb === null && TOTAL_OSB_HEADERS.has(normalizedHeader)) {
      row.totalOsb = parseSavedCollectionMoney(rawValue);
    }
    if (row.agingBucket === null && AGING_STATUS_HEADERS.has(normalizedHeader)) {
      row.agingBucket = normalizeCanonicalAgingBucket(rawValue);
    }
    if (row.callingDate === null && CALLING_DATE_HEADERS.has(normalizedHeader)) {
      const parsedCallingDate = parseSavedCallingDate(rawValue);
      const window = parsedCallingDate ? buildCollectionCallingWindow(parsedCallingDate) : null;
      row.callingDate = window?.start ?? null;
      row.callingWindowEnd = window?.endInclusive ?? null;
      row.callingWindowEndExclusive = window?.endExclusive ?? null;
    }
  }

  return row;
}

/**
 * Return deterministic compatibility diagnostics without exposing raw master
 * row values. Malformed present fields are distinguished from missing fields.
 */
export function assessCanonicalSavedCollectionCompatibility(
  value: unknown,
): CanonicalSavedCollectionCompatibility {
  const row = extractCanonicalSavedCollectionMasterRow(value);
  const invalid = new Set<string>();
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [header, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, MAX_ROW_FIELDS)) {
      const normalizedHeader = normalizeHeader(header);
      if (
        (ACCOUNT_NUMBER_CANONICAL_HEADERS.has(normalizedHeader)
          || CARD_NUMBER_CANONICAL_HEADERS.has(normalizedHeader))
        && readBoundedScalar(rawValue).trim()
        && parseCanonicalSavedIdentifier(rawValue) === null
      ) {
        invalid.add("accountOrCard");
      }
      if (TOTAL_DUE_HEADERS.has(normalizedHeader)) {
        if (
          parseSavedCollectionMoney(rawValue, { allowZero: false }) === null
          && readBoundedScalar(rawValue).trim()
        ) invalid.add("totalDue");
      }
      if (BILLING_PRINCIPAL_OSP_HEADERS.has(normalizedHeader)) {
        if (parseSavedCollectionMoney(rawValue) === null && readBoundedScalar(rawValue).trim()) invalid.add("osp");
      }
      if (AGING_STATUS_HEADERS.has(normalizedHeader)) {
        if (normalizeCanonicalAgingBucket(rawValue) === null && readBoundedScalar(rawValue).trim()) invalid.add("dcSts");
      }
      if (CALLING_DATE_HEADERS.has(normalizedHeader)) {
        if (readBoundedScalar(rawValue).trim() && !parseSavedCallingDate(rawValue)) invalid.add("callingDate");
      }
    }
  }

  const issues: CanonicalSavedCollectionCompatibilityIssue[] = [];
  if (!row.accountNumber && !row.cardNumber) {
    issues.push(invalid.has("accountOrCard") ? "invalid_account_or_card" : "missing_account_or_card");
  }
  if (!row.totalDue) issues.push(invalid.has("totalDue") ? "invalid_total_due" : "missing_total_due");
  if (!row.billingPrincipalOsp) {
    issues.push(invalid.has("osp") ? "invalid_billing_principal_osp" : "missing_billing_principal_osp");
  }
  // Total OSB is intentionally optional. The OSP report must use Billing
  // Principal and must never reject a valid source merely because Total OSB
  // is absent.
  if (!row.agingBucket) issues.push(invalid.has("dcSts") ? "invalid_dc_sts" : "missing_dc_sts");
  if (!row.callingDate) issues.push(invalid.has("callingDate") ? "invalid_calling_date" : "missing_calling_date");

  return { compatible: issues.length === 0, issues, row };
}

function normalizeLookup(input: SavedCollectionSourceLookup): NormalizedSavedLookup {
  return {
    customerName: normalizeCollectionPiiSearchValue("customerName", input.customerName),
    icNumber: normalizeCollectionPiiSearchValue("icNumber", input.icNumber),
    customerPhone: normalizeCollectionPiiSearchValue("customerPhone", input.customerPhone),
    accountNumber: normalizeCollectionPiiSearchValue("accountNumber", input.accountNumber),
  };
}

export function extractSavedCollectionIdentity(value: unknown): NormalizedSavedIdentity {
  const identity: NormalizedSavedIdentity = {
    customerName: "",
    icNumber: "",
    customerPhone: "",
    accountNumbers: [],
  };
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return identity;
  }

  for (const [header, rawValue] of Object.entries(value as Record<string, unknown>).slice(0, MAX_ROW_FIELDS)) {
    const scalar = readBoundedScalar(rawValue);
    if (!scalar) continue;

    const normalizedHeader = normalizeHeader(header);
    const identifierKind = resolveSpreadsheetIdentifierKind(header);
    if (!identity.icNumber && identifierKind === "malaysianIc") {
      identity.icNumber = normalizeCollectionPiiSearchValue("icNumber", scalar);
      continue;
    }
    if (!identity.customerPhone && identifierKind === "phone") {
      identity.customerPhone = normalizeCollectionPiiSearchValue("customerPhone", scalar);
      continue;
    }
    if (isSpreadsheetAccountHeader(header)) {
      const accountNumber = normalizeCollectionPiiSearchValue("accountNumber", scalar);
      if (
        accountNumber
        && identity.accountNumbers.length < MAX_SPREADSHEET_ACCOUNT_VALUES
        && !identity.accountNumbers.includes(accountNumber)
      ) {
        identity.accountNumbers.push(accountNumber);
      }
      continue;
    }
    if (!identity.customerName && NAME_HEADERS.has(normalizedHeader)) {
      identity.customerName = normalizeCollectionPiiSearchValue("customerName", scalar);
    }
  }

  return identity;
}

export function buildSavedCollectionLookupTerms(input: SavedCollectionSourceLookup): string[] {
  const normalized = normalizeLookup(input);
  const terms = new Set<string>();

  if (normalized.icNumber.length >= 6) {
    terms.add(normalized.icNumber);
    if (/^\d{12}$/.test(normalized.icNumber)) {
      terms.add(`${normalized.icNumber.slice(0, 6)}-${normalized.icNumber.slice(6, 8)}-${normalized.icNumber.slice(8)}`);
    }
  }
  if (normalized.customerPhone.length >= 7) {
    terms.add(normalized.customerPhone);
    if (normalized.customerPhone.startsWith("0")) {
      terms.add(`60${normalized.customerPhone.slice(1)}`);
    }
  }
  if (normalized.accountNumber.length >= 4) {
    terms.add(normalized.accountNumber);
  }

  return Array.from(terms).slice(0, MAX_LOOKUP_TERMS);
}

function getCandidateTimestamp(value: string | Date | null): number {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : 0;
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildSavedCollectionSourceMatches(
  input: SavedCollectionSourceLookup,
  candidates: SavedCollectionSourceCandidate[],
): Array<SavedCollectionSourceMatch & { rankScore: number; timestamp: number }> {
  const requested = normalizeLookup(input);
  const ranked = candidates.flatMap((candidate) => {
    const saved = extractSavedCollectionIdentity(candidate.jsonDataJsonb);
    const icMatch = Boolean(requested.icNumber && saved.icNumber && requested.icNumber === saved.icNumber);
    const phoneMatch = Boolean(
      requested.customerPhone
      && saved.customerPhone
      && requested.customerPhone === saved.customerPhone,
    );
    const accountMatch = Boolean(
      requested.accountNumber
      && saved.accountNumbers.includes(requested.accountNumber),
    );
    const conflictingAccount = Boolean(
      requested.accountNumber
      && saved.accountNumbers.length > 0
      && !accountMatch,
    );
    const conflictingIc = Boolean(
      requested.icNumber
      && saved.icNumber
      && requested.icNumber !== saved.icNumber,
    );
    const phoneAndAccountMatch = !conflictingIc && phoneMatch && accountMatch;
    if ((!icMatch || conflictingAccount) && !phoneAndAccountMatch) {
      return [];
    }

    const nameMatch = Boolean(
      requested.customerName
      && saved.customerName
      && requested.customerName === saved.customerName,
    );
    const comparisons: Array<{ field: SavedCollectionMatchField; comparable: boolean; matched: boolean }> = [
      {
        field: "customer_name",
        comparable: Boolean(requested.customerName && saved.customerName),
        matched: nameMatch,
      },
      {
        field: "ic_number",
        comparable: Boolean(requested.icNumber && saved.icNumber),
        matched: icMatch,
      },
      {
        field: "customer_phone",
        comparable: Boolean(requested.customerPhone && saved.customerPhone),
        matched: phoneMatch,
      },
      {
        field: "account_number",
        comparable: Boolean(requested.accountNumber && saved.accountNumbers.length > 0),
        matched: accountMatch,
      },
    ];
    const comparedFields = comparisons.filter((item) => item.comparable).map((item) => item.field);
    const matchedFields = comparisons.filter((item) => item.comparable && item.matched).map((item) => item.field);
    const matchAccuracy = comparedFields.length > 0
      ? Math.round((matchedFields.length / comparedFields.length) * 100)
      : 0;
    const financials = extractSavedCollectionFinancials(candidate.jsonDataJsonb);
    return [{
      rowId: candidate.rowId,
      sourceImportId: candidate.sourceImportId,
      sourceImportName: candidate.sourceImportName,
      sourceFilename: candidate.sourceFilename,
      matchBasis: icMatch ? "ic" as const : "phone_and_account" as const,
      matchAccuracy,
      matchedFields,
      comparedFields,
      totalDue: financials.totalDue,
      billingPrincipalOsp: financials.billingPrincipalOsp,
      callingDate: financials.callingDate,
      callingWindowEnd: financials.callingWindowEnd,
      callingWindowEndExclusive: financials.callingWindowEndExclusive,
      rankScore: (icMatch ? 100 : 60) + (phoneMatch ? 10 : 0) + (accountMatch ? 10 : 0) + (nameMatch ? 5 : 0),
      timestamp: getCandidateTimestamp(candidate.sourceCreatedAt),
    }];
  });

  return ranked;
}

type RankedSavedCollectionSourceMatch = ReturnType<typeof buildSavedCollectionSourceMatches>[number];

function compareSavedCollectionSourceMatches(
  left: RankedSavedCollectionSourceMatch,
  right: RankedSavedCollectionSourceMatch,
): number {
  return right.rankScore - left.rankScore
    || right.matchAccuracy - left.matchAccuracy
    // Only prefer a usable TOTAL DUE after identity strength and accuracy tie.
    // This prevents a duplicate blank financial row from hiding an equally
    // verified row without allowing weaker identity evidence to win.
    || Number(right.totalDue !== null) - Number(left.totalDue !== null)
    || right.timestamp - left.timestamp
    || right.rowId.localeCompare(left.rowId);
}

export function selectSavedCollectionSourceMatches(
  input: SavedCollectionSourceLookup,
  candidates: SavedCollectionSourceCandidate[],
  limit = MAX_SAVED_COLLECTION_SOURCE_MATCHES,
): SavedCollectionSourceMatch[] {
  const selectedSourceImportId = String(input.sourceImportId || "").trim();
  const scopedCandidates = selectedSourceImportId
    ? candidates.filter((candidate) => candidate.sourceImportId === selectedSourceImportId)
    : candidates;
  const matches = buildSavedCollectionSourceMatches(input, scopedCandidates)
    .sort(compareSavedCollectionSourceMatches);
  const boundedLimit = Math.max(1, Math.min(limit, MAX_SAVED_COLLECTION_SOURCE_MATCHES));
  if (selectedSourceImportId) {
    return matches.slice(0, boundedLimit).map((match) => {
      const { rankScore: _rankScore, timestamp: _timestamp, ...publicMatch } = match;
      return publicMatch;
    });
  }

  const selectedImportIds = new Set<string>();
  const result: SavedCollectionSourceMatch[] = [];

  for (const match of matches) {
    if (selectedImportIds.has(match.sourceImportId)) continue;
    selectedImportIds.add(match.sourceImportId);
    const { rankScore: _rankScore, timestamp: _timestamp, ...publicMatch } = match;
    result.push(publicMatch);
    if (result.length >= boundedLimit) break;
  }

  return result;
}

export function selectSavedCollectionSourceMatch(
  input: SavedCollectionSourceLookup,
  candidates: SavedCollectionSourceCandidate[],
): SavedCollectionSourceMatch | null {
  const selected = buildSavedCollectionSourceMatches(input, candidates)
    .sort(compareSavedCollectionSourceMatches)[0];
  if (!selected) return null;

  const { rankScore: _rankScore, timestamp: _timestamp, ...match } = selected;
  return {
    ...match,
  };
}
