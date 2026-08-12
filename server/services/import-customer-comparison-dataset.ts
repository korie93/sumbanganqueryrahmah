import type { DataRow } from "../../shared/schema-postgres";
import {
  isSpreadsheetAccountHeader,
  resolveSpreadsheetIdentifierKind,
} from "../../shared/common/spreadsheet-identifier-normalization";
import { normalizeCollectionPiiSearchValue } from "../lib/collection-pii-encryption-normalize";

const COMPARISON_CHUNK_SIZE = 500;
const MAX_COMPARISON_ROWS_PER_IMPORT = 100_000;
const MAX_COMPARISON_IDENTITIES_PER_IMPORT = 75_000;
const MAX_ROW_FIELDS = 200;
const MAX_FIELD_VALUE_LENGTH = 256;
const MAX_ACCOUNT_VALUES = 8;

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

export type ImportComparisonIdentityBasis = "ic" | "account" | "phone_and_name" | "none";

export type ImportComparisonIdentity = {
  key: string;
  basis: ImportComparisonIdentityBasis;
  normalizedName: string;
  normalizedIc: string;
  normalizedPhone: string;
  customerName: string | null;
  icNumber: string | null;
  customerPhone: string | null;
  accounts: Map<string, string>;
  occurrences: number;
};

export type ImportComparisonDataset = {
  entities: Map<string, ImportComparisonIdentity>;
  rowCount: number;
};

type CollectComparisonDatasetInput = {
  importId: string;
  expectedRowCount: number;
  signal?: AbortSignal | undefined;
  loadPage: (
    importId: string,
    limit: number,
    afterRowId: string | null,
  ) => Promise<DataRow[]>;
};

export class ImportComparisonLimitError extends Error {
  constructor() {
    super(
      "Customer comparison supports up to 100,000 rows and 75,000 distinct identities per file.",
    );
    this.name = "ImportComparisonLimitError";
  }
}

function normalizeHeader(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function readScalar(value: unknown): string {
  if (typeof value === "string") {
    return value.trim().slice(0, MAX_FIELD_VALUE_LENGTH);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value).slice(0, MAX_FIELD_VALUE_LENGTH);
  }
  if (typeof value === "bigint") {
    return String(value).slice(0, MAX_FIELD_VALUE_LENGTH);
  }
  return "";
}

function normalizeComparisonAccount(value: unknown): string {
  return normalizeCollectionPiiSearchValue("accountNumber", value)
    .replace(/[^0-9A-Z]/g, "");
}

function abortError(): Error {
  const error = new Error("Import comparison was aborted.");
  error.name = "AbortError";
  return error;
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

function extractRowIdentity(
  importId: string,
  row: DataRow,
): ImportComparisonIdentity {
  let customerName: string | null = null;
  let icNumber: string | null = null;
  let customerPhone: string | null = null;
  const accounts = new Map<string, string>();
  const value = row.jsonDataJsonb;

  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [header, rawValue] of Object.entries(value).slice(0, MAX_ROW_FIELDS)) {
      const scalar = readScalar(rawValue);
      if (!scalar) continue;

      const identifierKind = resolveSpreadsheetIdentifierKind(header);
      if (!icNumber && identifierKind === "malaysianIc") {
        icNumber = scalar;
        continue;
      }
      if (!customerPhone && identifierKind === "phone") {
        customerPhone = scalar;
        continue;
      }
      if (isSpreadsheetAccountHeader(header)) {
        const normalizedAccount = normalizeComparisonAccount(scalar);
        if (normalizedAccount && accounts.size < MAX_ACCOUNT_VALUES) {
          accounts.set(normalizedAccount, scalar);
        }
        continue;
      }
      if (!customerName && NAME_HEADERS.has(normalizeHeader(header))) {
        customerName = scalar;
      }
    }
  }

  const normalizedName = normalizeCollectionPiiSearchValue("customerName", customerName);
  const normalizedIc = normalizeCollectionPiiSearchValue("icNumber", icNumber);
  const normalizedPhone = normalizeCollectionPiiSearchValue("customerPhone", customerPhone);
  const firstAccount = Array.from(accounts.keys()).sort()[0] ?? "";
  let key = `unidentified:${importId}:${row.id}`;
  let basis: ImportComparisonIdentityBasis = "none";

  if (normalizedIc) {
    key = `ic:${normalizedIc}`;
    basis = "ic";
  } else if (normalizedPhone && normalizedName) {
    key = `phone-name:${normalizedPhone}:${normalizedName}`;
    basis = "phone_and_name";
  } else if (firstAccount) {
    key = `account:${firstAccount}`;
    basis = "account";
  }

  return {
    key,
    basis,
    normalizedName,
    normalizedIc,
    normalizedPhone,
    customerName,
    icNumber,
    customerPhone,
    accounts,
    occurrences: 1,
  };
}

function mergeIdentity(
  target: ImportComparisonIdentity,
  source: ImportComparisonIdentity,
): void {
  target.occurrences += source.occurrences;
  target.customerName ||= source.customerName;
  target.icNumber ||= source.icNumber;
  target.customerPhone ||= source.customerPhone;
  target.normalizedName ||= source.normalizedName;
  target.normalizedIc ||= source.normalizedIc;
  target.normalizedPhone ||= source.normalizedPhone;
  for (const [normalized, display] of source.accounts) {
    if (target.accounts.size >= MAX_ACCOUNT_VALUES) break;
    if (!target.accounts.has(normalized)) {
      target.accounts.set(normalized, display);
    }
  }
}

export async function collectImportComparisonDataset(
  input: CollectComparisonDatasetInput,
): Promise<ImportComparisonDataset> {
  if (input.expectedRowCount > MAX_COMPARISON_ROWS_PER_IMPORT) {
    throw new ImportComparisonLimitError();
  }

  const entities = new Map<string, ImportComparisonIdentity>();
  let rowCount = 0;
  let afterRowId: string | null = null;

  while (rowCount < input.expectedRowCount) {
    assertNotAborted(input.signal);
    const rows = await input.loadPage(
      input.importId,
      COMPARISON_CHUNK_SIZE,
      afterRowId,
    );
    assertNotAborted(input.signal);
    if (rows.length === 0) break;

    for (const row of rows) {
      if (rowCount >= MAX_COMPARISON_ROWS_PER_IMPORT) {
        throw new ImportComparisonLimitError();
      }
      const identity = extractRowIdentity(input.importId, row);
      const existing = entities.get(identity.key);
      if (existing) {
        mergeIdentity(existing, identity);
      } else {
        if (entities.size >= MAX_COMPARISON_IDENTITIES_PER_IMPORT) {
          throw new ImportComparisonLimitError();
        }
        entities.set(identity.key, identity);
      }
      rowCount += 1;
    }

    const nextRowId = String(rows[rows.length - 1]?.id || "");
    if (!nextRowId || nextRowId === afterRowId) {
      throw new Error("Import comparison pagination did not advance.");
    }
    afterRowId = nextRowId;
    if (rows.length < COMPARISON_CHUNK_SIZE) break;
  }

  return { entities, rowCount };
}

export const importComparisonLimits = {
  chunkSize: COMPARISON_CHUNK_SIZE,
  maxRowsPerImport: MAX_COMPARISON_ROWS_PER_IMPORT,
  maxIdentitiesPerImport: MAX_COMPARISON_IDENTITIES_PER_IMPORT,
} as const;
