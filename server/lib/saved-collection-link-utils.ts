import { normalizeCollectionPiiSearchValue } from "./collection-pii-encryption-normalize";
import {
  isSpreadsheetAccountHeader,
  MAX_SPREADSHEET_ACCOUNT_VALUES,
  resolveSpreadsheetIdentifierKind,
} from "../../shared/common/spreadsheet-identifier-normalization";
import type {
  SavedCollectionSourceCandidate,
  SavedCollectionSourceLookup,
  SavedCollectionSourceMatch,
} from "../repositories/search-repository-types";

const MAX_ROW_FIELDS = 200;
const MAX_FIELD_VALUE_LENGTH = 256;
const MAX_LOOKUP_TERMS = 8;

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

type NormalizedSavedLookup = {
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
};

type NormalizedSavedIdentity = Omit<NormalizedSavedLookup, "accountNumber"> & {
  accountNumbers: string[];
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

export function selectSavedCollectionSourceMatch(
  input: SavedCollectionSourceLookup,
  candidates: SavedCollectionSourceCandidate[],
): SavedCollectionSourceMatch | null {
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
    return [{
      candidate,
      matchBasis: icMatch ? "ic" as const : "phone_and_account" as const,
      score: (icMatch ? 100 : 60) + (phoneMatch ? 10 : 0) + (accountMatch ? 10 : 0) + (nameMatch ? 5 : 0),
      timestamp: getCandidateTimestamp(candidate.sourceCreatedAt),
    }];
  });

  ranked.sort((left, right) =>
    right.score - left.score
    || right.timestamp - left.timestamp
    || right.candidate.rowId.localeCompare(left.candidate.rowId),
  );
  const selected = ranked[0];
  if (!selected) return null;

  return {
    rowId: selected.candidate.rowId,
    sourceImportId: selected.candidate.sourceImportId,
    sourceImportName: selected.candidate.sourceImportName,
    sourceFilename: selected.candidate.sourceFilename,
    matchBasis: selected.matchBasis,
  };
}
