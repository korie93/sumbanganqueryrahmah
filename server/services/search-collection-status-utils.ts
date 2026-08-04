import { hashCollectionPiiSearchValue } from "../lib/collection-pii-encryption";
import { normalizeCollectionPiiSearchValue } from "../lib/collection-pii-encryption-normalize";
import {
  MAX_SEARCH_COLLECTION_STATUS_CANDIDATES,
  type SearchCollectionStatusCandidate,
  type SearchCollectionStatusMatch,
} from "../repositories/search-repository-types";
import { resolveSpreadsheetIdentifierKind } from "../../shared/common/spreadsheet-identifier-normalization";

const MAX_SEARCH_ROW_FIELDS = 200;
const MAX_IDENTIFIER_INPUT_LENGTH = 256;
const ACCOUNT_HEADERS = new Set([
  "acc",
  "accno",
  "account",
  "accountno",
  "accountnumber",
  "acct",
  "acctno",
  "akaun",
  "noakaun",
  "nomborakaun",
]);

type SearchRowForCollectionStatus = {
  id?: string | null;
  importId?: string | null;
  jsonDataJsonb?: unknown;
};

export type SearchCollectionStatus = {
  state: "recorded" | "not_recorded" | "unavailable";
  recordCount: number;
  latestPaymentDate: string | null;
  latestCreatedAt: string | null;
  latestStaffNickname: string | null;
  sourceImportName: string | null;
  sourceFilename: string | null;
  matchBasis: "source_and_identifier" | "identifier_only" | null;
};

function normalizeHeader(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
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
  let accountValue = "";
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
    if (!accountValue && ACCOUNT_HEADERS.has(normalizeHeader(header))) {
      accountValue = normalizeCollectionPiiSearchValue("accountNumber", value);
    }
  }

  if (!icValue && !phoneValue && !accountValue) {
    return null;
  }

  return {
    rowId,
    sourceImportId,
    icHash: icValue ? hashCollectionPiiSearchValue("icNumber", icValue) : null,
    icValue: icValue || null,
    phoneHash: phoneValue ? hashCollectionPiiSearchValue("customerPhone", phoneValue) : null,
    phoneValue: phoneValue || null,
    accountHash: accountValue ? hashCollectionPiiSearchValue("accountNumber", accountValue) : null,
    accountValue: accountValue || null,
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
  includeSensitiveDetails: boolean;
}): Map<string, SearchCollectionStatus> {
  const candidateIds = new Set(params.candidates.map((candidate) => candidate.rowId));
  const matchesByRowId = new Map(params.matches.map((match) => [match.rowId, match]));
  const statuses = new Map<string, SearchCollectionStatus>();

  for (const row of params.rows) {
    const rowId = String(row.id || "").trim();
    if (!rowId) continue;

    const match = matchesByRowId.get(rowId);
    if (match) {
      statuses.set(rowId, {
        state: "recorded",
        recordCount: Math.max(1, Math.trunc(match.recordCount || 1)),
        latestPaymentDate: match.latestPaymentDate,
        latestCreatedAt: match.latestCreatedAt,
        latestStaffNickname: params.includeSensitiveDetails ? match.latestStaffNickname : null,
        sourceImportName: params.includeSensitiveDetails ? match.sourceImportName : null,
        sourceFilename: params.includeSensitiveDetails ? match.sourceFilename : null,
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
      sourceImportName: null,
      sourceFilename: null,
      matchBasis: null,
    });
  }

  return statuses;
}
