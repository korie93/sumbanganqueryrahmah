import type { DataRow, Import, InsertDataRow } from "../../shared/schema-postgres";
import type {
  ImportListPage,
  ImportsRepository,
} from "../repositories/imports.repository";
import type { ImportAnalysisService } from "./import-analysis.service";
import type { PostgresStorage } from "../storage-postgres";

type SearchDataRowsResult = Awaited<ReturnType<PostgresStorage["searchDataRows"]>>;
type AnalyzeImportResult = Awaited<ReturnType<ImportAnalysisService["analyzeImport"]>>;
type AnalyzeAllImportsResult = Awaited<ReturnType<ImportAnalysisService["analyzeAll"]>>;

type ImportsStorage = Pick<
  PostgresStorage,
  | "createAuditLog"
  | "createDataRow"
  | "createImport"
  | "deleteImport"
  | "getDataRowsByImport"
  | "getImportById"
  | "searchDataRows"
  | "updateImportName"
>;

export type ImportDataColumnFilter = {
  column: string;
  operator: "contains" | "equals" | "startsWith" | "endsWith" | "notEquals";
  value: string;
};

export type ImportDataPageCursor = {
  lastRowId: string;
  page: number;
};

export type CreateImportInput = {
  name: string;
  filename: string;
  dataRows: unknown[];
  createdBy?: string | undefined;
};

export type CreateImportFromCsvFileInput = {
  name: string;
  filename: string;
  filePath: string;
  rowCount: number;
  createdBy?: string | undefined;
};

export type ImportDataPageInput = {
  importId: string;
  page: number;
  cursor?: string | null | undefined;
  requestedLimit: number;
  viewerRowsPerPage: number;
  isDbProtected: boolean;
  search?: string | null | undefined;
  columnFilters?: ImportDataColumnFilter[] | undefined;
};

export type SearchImportRowsInput = {
  importId: string;
  limit: number;
  offset: number;
  search?: string | null;
  columnFilters?: ImportDataColumnFilter[];
  cursor?: string | null;
};

export type ImportDetailsResult = {
  import: Import;
  rows: DataRow[];
};

export type ListImportsInput = {
  cursor?: string | null;
  limit?: number;
  search?: string | null;
  createdOn?: string | null;
};

export type ImportDataPageResult = {
  rows: Array<{
    id: string;
    importId: string;
    jsonDataJsonb: unknown;
  }>;
  headers: string[];
  total: number;
  page: number;
  limit: number;
  pageSize: number;
  nextCursor: string | null;
};

export type CreateImportBody = {
  name: string;
  filename: string;
  dataRows: unknown[];
};

export type RenameImportBody = {
  name: string;
};

export type ImportsServiceStorage = ImportsStorage;
export type ImportsServiceRepository = Pick<
  ImportsRepository,
  "getImportColumnNames" | "getImportsWithRowCounts" | "listImportsWithRowCountsPage"
>;
export type ImportsServiceAnalysis = Pick<
  ImportAnalysisService,
  "analyzeAll" | "analyzeImport"
>;

export type NormalizeImportRowResult = InsertDataRow["jsonDataJsonb"];
export type { AnalyzeAllImportsResult, AnalyzeImportResult, SearchDataRowsResult, ImportListPage };
