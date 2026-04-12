import type { DataRow } from "../../shared/schema-postgres";

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
