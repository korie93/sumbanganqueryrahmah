import type { DataRow } from "../../shared/schema-postgres";

export const MAX_SEARCH_COLLECTION_STATUS_CANDIDATES = 200;

export type SearchQueryRow = Record<string, unknown>;

export type SearchColumnFilter = {
  column: string;
  operator: string;
  value: string;
};

export type SearchGlobalDataRow = {
  id: string;
  rowId?: string | null;
  importId: string;
  importName: string | null;
  importFilename: string | null;
  jsonDataJsonb: unknown;
};

export type SearchDataRow = {
  id: string;
  importId: string;
  jsonDataJsonb: unknown;
};

export type AdvancedSearchDataRow = DataRow & {
  importName?: string | null;
  importFilename?: string | null;
};

export type SearchCollectionStatusCandidate = {
  rowId: string;
  sourceImportId: string;
  icHash: string | null;
  icValue: string | null;
  phoneHash: string | null;
  phoneValue: string | null;
  accountHashes: string[];
  accountValues: string[];
};

export type SavedCollectionSourceLookup = {
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  sourceImportId?: string | null;
};

export type SavedCollectionSourceCandidate = {
  rowId: string;
  sourceImportId: string;
  sourceImportName: string | null;
  sourceFilename: string | null;
  sourceCreatedAt: string | Date | null;
  jsonDataJsonb: unknown;
};

export type SavedCollectionSourceMatch = {
  rowId: string;
  sourceImportId: string;
  sourceImportName: string | null;
  sourceFilename: string | null;
  matchBasis: "ic" | "phone_and_account";
  matchAccuracy: number;
  matchedFields: SavedCollectionMatchField[];
  comparedFields: SavedCollectionMatchField[];
  totalDue: string | null;
  billingPrincipalOsp: string | null;
  callingDate: string | null;
  callingWindowEnd: string | null;
  callingWindowEndExclusive: string | null;
};

export type CollectionSavedSourceFile = {
  id: string;
  name: string;
  filename: string;
  createdAt: string;
  rowCount: number;
};

export type CollectionSavedSourceFilePage = {
  items: CollectionSavedSourceFile[];
  limit: number;
  nextCursor: string | null;
  total: number;
};

export type CollectionSettlementProjectionInput = {
  callingDate: string;
  callingWindowEndExclusive: string;
  currentAmount: string;
  excludeRecordId?: string | null;
  paymentDate: string;
  sourceDataRowId: string;
  sourceImportId: string;
  settlementCycleKey?: string | null;
  totalDue: string;
};

export type CollectionSettlementProjection = {
  currentEntry: string;
  existingCumulative: string;
  projectedCpStatus: "abort_cp" | "cp";
  projectedCumulative: string;
  projectedTotalDueCovered: boolean;
  remainingAfterSave: string;
};

export type SavedCollectionMatchField =
  | "customer_name"
  | "ic_number"
  | "customer_phone"
  | "account_number";

export type SearchCollectionViewerScope =
  | { kind: "all" }
  | { kind: "created_by"; username: string }
  | { kind: "nicknames"; nicknames: string[] }
  | { kind: "none" };

export type SearchCollectionStatusMatch = {
  rowId: string;
  recordCount: number;
  isHistorical: boolean;
  latestPaymentDate: string | null;
  latestCreatedAt: string | null;
  latestStaffNickname: string | null;
  latestCreatedByLogin: string | null;
  latestAccountNumber: string | null;
  matchedAccountHash: string | null;
  latestAmount: string | null;
  sourceImportName: string | null;
  sourceFilename: string | null;
  purgedAt: string | null;
  purgedBy: string | null;
  matchBasis: "source_row" | "source_and_identifier" | "identifier_only";
};

export type SearchCollectionHistorySourceRow = {
  id: string;
  importId: string;
  jsonDataJsonb: unknown;
  sourceObligationKey: string | null;
};

export type SearchCollectionHistoryItem = {
  id: string;
  kind: "collection" | "pool";
  isHistorical: boolean;
  paymentDate: string;
  createdAt: string;
  amount: string;
  classificationSource: "automatic" | "manual_verified_abort";
  automaticClassification: "cp" | "abort_cp" | null;
  effectiveStatus:
    | "cp"
    | "abort_cp"
    | "requires_revalidation"
    | "superseded_by_automatic"
    | "revoked"
    | "unclassified"
    | "historical";
  settlementDate: string | null;
  staffNickname: string | null;
  createdByLogin: string | null;
  sourceImportName: string | null;
  sourceFilename: string | null;
  purgedAt: string | null;
  purgedBy: string | null;
  reason?: string | null;
  note?: string | null;
  reference?: string | null;
};

export type SearchCollectionHistorySummary = {
  recordCount: number;
  activeRecordCount: number;
  historicalRecordCount: number;
  poolContributionCount: number;
  collectionAmount: string;
  poolAmount: string;
  totalCoveredAmount: string;
  effectiveStatus: "cp" | "abort_cp" | "requires_revalidation" | "unclassified" | "historical";
};

export type SearchCollectionHistoryPage = {
  items: SearchCollectionHistoryItem[];
  summary: SearchCollectionHistorySummary;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};
