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
  accountHash: string | null;
  accountValue: string | null;
};

export type SearchCollectionStatusMatch = {
  rowId: string;
  recordCount: number;
  latestPaymentDate: string | null;
  latestCreatedAt: string | null;
  latestStaffNickname: string | null;
  sourceImportName: string | null;
  sourceFilename: string | null;
  matchBasis: "source_and_identifier" | "identifier_only";
};
