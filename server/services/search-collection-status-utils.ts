import { hashCollectionPiiSearchValue } from "../lib/collection-pii-encryption";
import { normalizeCollectionPiiSearchValue } from "../lib/collection-pii-encryption-normalize";
import {
  MAX_SEARCH_COLLECTION_STATUS_CANDIDATES,
  type SearchCollectionStatusCandidate,
  type SearchCollectionStatusMatch,
} from "../repositories/search-repository-types";
import {
  isSpreadsheetAccountHeader,
  MAX_SPREADSHEET_ACCOUNT_VALUES,
  resolveSpreadsheetIdentifierKind,
} from "../../shared/common/spreadsheet-identifier-normalization";

const MAX_SEARCH_ROW_FIELDS = 200;
const MAX_IDENTIFIER_INPUT_LENGTH = 256;
const MAX_COLLECTION_ACCOUNT_DISPLAY_LENGTH = 256;

type SearchRowForCollectionStatus = {
  id?: string | null;
  importId?: string | null;
  jsonDataJsonb?: unknown;
};

export type SearchCollectionStatus = {
  state: "recorded" | "historical" | "not_recorded" | "unavailable";
  recordCount: number;
  latestPaymentDate: string | null;
  latestCreatedAt: string | null;
  latestStaffNickname: string | null;
  latestCreatedByLogin: string | null;
  latestAccountNumber: string | null;
  latestAmount: string | null;
  sourceImportName: string | null;
  sourceFilename: string | null;
  purgedAt: string | null;
  purgedBy: string | null;
  matchBasis: "source_row" | "source_and_identifier" | "identifier_only" | null;
  historyKey?: string | null;
};

function resolveHistoricalAccountNumber(
  candidate: SearchCollectionStatusCandidate | undefined,
  matchedAccountHash: string | null,
): string | null {
  if (!candidate || !matchedAccountHash) {
    return null;
  }

  const accountIndex = candidate.accountHashes.indexOf(matchedAccountHash);
  if (accountIndex < 0) {
    return null;
  }

  return candidate.accountValues[accountIndex]?.slice(0, MAX_COLLECTION_ACCOUNT_DISPLAY_LENGTH)
    || null;
}

function readIdentifierValue(value: unknown): string {
  if (typeof value === "string") {
    return value.slice(0, MAX_IDENTIFIER_INPUT_LENGTH);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value).slice(0, MAX_IDENTIFIER_INPUT_LENGTH);
  }
  if (typeof value === "bigint") {
    return String(value).slice(0, MAX_IDENTIFIER_INPUT_LENGTH);
  }
  return "";
}

function buildCandidate(
  row: SearchRowForCollectionStatus,
): SearchCollectionStatusCandidate | null {
  const rowId = String(row.id || "").trim().slice(0, 200);
  const sourceImportId = String(row.importId || "").trim().slice(0, 200);
  if (!rowId || !sourceImportId || !row.jsonDataJsonb || typeof row.jsonDataJsonb !== "object") {
    return null;
  }

  let icValue = "";
  let phoneValue = "";
  const accountValues = new Set<string>();
  const entries = Object.entries(row.jsonDataJsonb as Record<string, unknown>)
    .slice(0, MAX_SEARCH_ROW_FIELDS);

  for (const [header, rawValue] of entries) {
    const value = readIdentifierValue(rawValue);
    if (!value) continue;

    const spreadsheetKind = resolveSpreadsheetIdentifierKind(header);
    if (!icValue && spreadsheetKind === "malaysianIc") {
      icValue = normalizeCollectionPiiSearchValue("icNumber", value);
      continue;
    }
    if (!phoneValue && spreadsheetKind === "phone") {
      phoneValue = normalizeCollectionPiiSearchValue("customerPhone", value);
      continue;
    }
    if (
      accountValues.size < MAX_SPREADSHEET_ACCOUNT_VALUES
      && isSpreadsheetAccountHeader(header)
    ) {
      const accountValue = normalizeCollectionPiiSearchValue("accountNumber", value);
      if (accountValue) {
        accountValues.add(accountValue);
      }
    }
  }

  const normalizedAccountValues = Array.from(accountValues);
  if (!icValue && !phoneValue && normalizedAccountValues.length === 0) {
    return null;
  }

  return {
    rowId,
    sourceImportId,
    icHash: icValue ? hashCollectionPiiSearchValue("icNumber", icValue) : null,
    icValue: icValue || null,
    phoneHash: phoneValue ? hashCollectionPiiSearchValue("customerPhone", phoneValue) : null,
    phoneValue: phoneValue || null,
    accountHashes: normalizedAccountValues
      .map((accountValue) => hashCollectionPiiSearchValue("accountNumber", accountValue))
      .filter((accountHash): accountHash is string => Boolean(accountHash)),
    accountValues: normalizedAccountValues,
  };
}

export function buildSearchCollectionStatusCandidates(
  rows: SearchRowForCollectionStatus[],
): SearchCollectionStatusCandidate[] {
  return rows
    .map(buildCandidate)
    .filter((candidate): candidate is SearchCollectionStatusCandidate => candidate !== null)
    .slice(0, MAX_SEARCH_COLLECTION_STATUS_CANDIDATES);
}

export function buildSearchCollectionStatuses(params: {
  rows: SearchRowForCollectionStatus[];
  candidates: SearchCollectionStatusCandidate[];
  matches: SearchCollectionStatusMatch[];
  includeSourceDetails: boolean;
}): Map<string, SearchCollectionStatus> {
  const candidateIds = new Set(params.candidates.map((candidate) => candidate.rowId));
  const candidatesByRowId = new Map(
    params.candidates.map((candidate) => [candidate.rowId, candidate]),
  );
  const matchesByRowId = new Map(params.matches.map((match) => [match.rowId, match]));
  const statuses = new Map<string, SearchCollectionStatus>();

  for (const row of params.rows) {
    const rowId = String(row.id || "").trim();
    if (!rowId) continue;

    const match = matchesByRowId.get(rowId);
    if (match) {
      const latestAccountNumber = String(
        match.latestAccountNumber
        || (match.isHistorical
          ? resolveHistoricalAccountNumber(
              candidatesByRowId.get(rowId),
              match.matchedAccountHash,
            )
          : "")
        || "",
      )
        .trim()
        .slice(0, MAX_COLLECTION_ACCOUNT_DISPLAY_LENGTH) || null;
      statuses.set(rowId, {
        state: match.isHistorical ? "historical" : "recorded",
        recordCount: Math.max(1, Math.trunc(match.recordCount || 1)),
        latestPaymentDate: match.latestPaymentDate,
        latestCreatedAt: match.latestCreatedAt,
        latestStaffNickname: match.latestStaffNickname,
        latestCreatedByLogin: match.latestCreatedByLogin,
        latestAccountNumber,
        latestAmount: match.latestAmount,
        sourceImportName: params.includeSourceDetails ? match.sourceImportName : null,
        sourceFilename: params.includeSourceDetails ? match.sourceFilename : null,
        purgedAt: match.isHistorical ? match.purgedAt : null,
        purgedBy: match.isHistorical ? match.purgedBy : null,
        matchBasis: match.matchBasis,
      });
      continue;
    }

    statuses.set(rowId, {
      state: candidateIds.has(rowId) ? "not_recorded" : "unavailable",
      recordCount: 0,
      latestPaymentDate: null,
      latestCreatedAt: null,
      latestStaffNickname: null,
      latestCreatedByLogin: null,
      latestAccountNumber: null,
      latestAmount: null,
      sourceImportName: null,
      sourceFilename: null,
      purgedAt: null,
      purgedBy: null,
      matchBasis: null,
    });
  }

  return statuses;
}
