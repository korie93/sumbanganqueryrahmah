import { getGeneralSearchCollectionStatus } from "@/pages/general-search/collection-status";
import type { SearchResultRow } from "@/pages/general-search/types";
import { resolveSpreadsheetIdentifierKind } from "@shared/common/spreadsheet-identifier-normalization";

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
  "nomborakaunbankpemohon",
]);

export type GeneralSearchRelatedAccount = {
  accountNumber: string;
  collectionState: "historical" | "not_recorded" | "recorded" | "unavailable";
  isSelected: boolean;
  record: SearchResultRow;
  sourceFile: string | null;
};

function normalizeHeader(header: string): string {
  return header
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeMalaysianIc(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    const digits = value.toFixed(0);
    return digits.length === 12 ? digits : null;
  }

  if (typeof value !== "string") return null;
  const trimmedValue = value.trim();
  if (!/^[\d\s-]+$/.test(trimmedValue)) return null;
  const digits = trimmedValue.replace(/\D/g, "");
  return digits.length === 12 ? digits : null;
}

function getMalaysianIc(record: SearchResultRow): string | null {
  for (const [header, value] of Object.entries(record)) {
    if (resolveSpreadsheetIdentifierKind(header) !== "malaysianIc") continue;
    const normalizedValue = normalizeMalaysianIc(value);
    if (normalizedValue) return normalizedValue;
  }
  return null;
}

function getAccountNumber(record: SearchResultRow): string | null {
  for (const [header, value] of Object.entries(record)) {
    if (!ACCOUNT_HEADERS.has(normalizeHeader(header))) continue;
    if (typeof value !== "string" && typeof value !== "number") continue;
    const displayValue = String(value).trim();
    if (displayValue && displayValue !== "-") return displayValue;
  }
  return null;
}

function normalizeAccountKey(accountNumber: string): string {
  return accountNumber.normalize("NFKC").trim().toUpperCase();
}

function getSourceFile(record: SearchResultRow): string | null {
  const source = record["Source File"];
  return typeof source === "string" && source.trim() ? source.trim() : null;
}

function getCollectionStateScore(state: GeneralSearchRelatedAccount["collectionState"]): number {
  if (state === "recorded") return 3;
  if (state === "historical") return 2;
  if (state === "not_recorded") return 1;
  return 0;
}

function buildRelatedAccount(
  record: SearchResultRow,
  accountNumber: string,
  selectedAccountKey: string,
): GeneralSearchRelatedAccount {
  return {
    accountNumber,
    collectionState: getGeneralSearchCollectionStatus(record).state,
    isSelected: normalizeAccountKey(accountNumber) === selectedAccountKey,
    record,
    sourceFile: getSourceFile(record),
  };
}

export function buildGeneralSearchRelatedAccounts(
  selectedRecord: SearchResultRow,
  searchResults: SearchResultRow[],
): GeneralSearchRelatedAccount[] {
  const selectedIc = getMalaysianIc(selectedRecord);
  const selectedAccountNumber = getAccountNumber(selectedRecord);
  if (!selectedIc || !selectedAccountNumber) return [];

  const selectedAccountKey = normalizeAccountKey(selectedAccountNumber);
  const records = [selectedRecord, ...searchResults.filter((record) => record !== selectedRecord)];
  const accountsByNumber = new Map<string, GeneralSearchRelatedAccount>();

  for (const record of records) {
    if (getMalaysianIc(record) !== selectedIc) continue;
    const accountNumber = getAccountNumber(record);
    if (!accountNumber) continue;

    const accountKey = normalizeAccountKey(accountNumber);
    const candidate = buildRelatedAccount(record, accountNumber, selectedAccountKey);
    const existing = accountsByNumber.get(accountKey);
    if (
      !existing
      || record === selectedRecord
      || (
        !existing.isSelected
        && getCollectionStateScore(candidate.collectionState)
          > getCollectionStateScore(existing.collectionState)
      )
    ) {
      accountsByNumber.set(accountKey, candidate);
    }
  }

  return [...accountsByNumber.values()].sort((left, right) => {
    if (left.isSelected !== right.isSelected) return left.isSelected ? -1 : 1;
    return left.accountNumber.localeCompare(right.accountNumber, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}
