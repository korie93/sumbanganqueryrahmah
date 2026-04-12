import type {
  DataRow,
  Import,
  InsertDataRow,
  InsertImport,
} from "../shared/schema-postgres";

type CategoryRule = {
  key: string;
  terms: string[];
  fields: string[];
  matchMode?: string;
  enabled?: boolean;
};

type BranchSearchResult = {
  name: string;
  address: string | null;
  phone: string | null;
  fax: string | null;
  businessHour: string | null;
  dayOpen: string | null;
  atmCdm: string | null;
  inquiryAvailability: string | null;
  applicationAvailability: string | null;
  aeonLounge: string | null;
};

export interface ImportAiStorageContract {
  createImport(data: InsertImport & { createdBy?: string }): Promise<Import>;
  getImports(): Promise<Import[]>;
  getImportById(id: string): Promise<Import | undefined>;
  updateImportName(id: string, name: string): Promise<Import | undefined>;
  deleteImport(id: string): Promise<boolean>;
  deleteDataRowsByImport(importId: string): Promise<number>;

  createDataRow(data: InsertDataRow): Promise<DataRow>;
  getDataRowsByImport(importId: string): Promise<DataRow[]>;
  getDataRowCountByImport(importId: string): Promise<number>;
  advancedSearchDataRows(
    filters: Array<{ field: string; operator: string; value: string }>,
    logic: "AND" | "OR",
    limit: number,
    offset: number,
  ): Promise<{ rows: DataRow[]; total: number }>;
  getAllColumnNames(): Promise<string[]>;

  createConversation(createdBy: string): Promise<string>;
  saveConversationMessage(
    conversationId: string,
    role: "user" | "assistant" | "system",
    content: string,
  ): Promise<void>;
  getConversationMessages(
    conversationId: string,
    limit?: number,
  ): Promise<Array<{ role: string; content: string }>>;
  saveEmbedding(params: {
    importId: string;
    rowId: string;
    content: string;
    embedding: number[];
  }): Promise<void>;
  semanticSearch(params: {
    embedding: number[];
    limit: number;
    importId?: string | null;
  }): Promise<Array<{
    rowId: string;
    importId: string;
    content: string;
    score: number;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: unknown;
  }>>;
  aiKeywordSearch(params: { query: string; limit: number }): Promise<Array<{
    rowId: string;
    importId: string;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: unknown;
  }>>;
  aiNameSearch(params: { query: string; limit: number }): Promise<Array<{
    rowId: string;
    importId: string;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: unknown;
  }>>;
  aiDigitsSearch(params: { digits: string; limit: number }): Promise<Array<{
    rowId: string;
    importId: string;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: unknown;
  }>>;
  aiFuzzySearch(params: { query: string; limit: number }): Promise<Array<{
    rowId: string;
    importId: string;
    importName: string | null;
    importFilename: string | null;
    jsonDataJsonb: unknown;
    score: number;
  }>>;
  findBranchesByText(params: {
    query: string;
    limit: number;
  }): Promise<BranchSearchResult[]>;
  findBranchesByPostcode(params: {
    postcode: string;
    limit: number;
  }): Promise<BranchSearchResult[]>;
  countRowsByKeywords(params: { groups: Array<CategoryRule> }): Promise<{
    totalRows: number;
    counts: Record<string, number>;
  }>;
  getCategoryRules(): Promise<Array<{
    key: string;
    terms: string[];
    fields: string[];
    matchMode: string;
    enabled: boolean;
  }>>;
  getCategoryStats(keys: string[]): Promise<Array<{
    key: string;
    total: number;
    samples: Array<{ name: string; ic: string; source: string | null }>;
    updatedAt: Date | null;
  }>>;
  computeCategoryStatsForKeys(keys: string[], groups: Array<CategoryRule>): Promise<
    Array<{
      key: string;
      total: number;
      samples: Array<{ name: string; ic: string; source: string | null }>;
      updatedAt: Date | null;
    }>
  >;
  rebuildCategoryStats(groups: Array<CategoryRule>): Promise<void>;
  getNearestBranches(params: {
    lat: number;
    lng: number;
    limit?: number;
  }): Promise<Array<BranchSearchResult & { distanceKm: number }>>;
  getPostcodeLatLng(postcode: string): Promise<{ lat: number; lng: number } | null>;
  importBranchesFromRows(params: {
    importId: string;
    nameKey?: string | null;
    latKey?: string | null;
    lngKey?: string | null;
  }): Promise<{
    inserted: number;
    skipped: number;
    usedKeys: { nameKey: string; latKey: string; lngKey: string };
  }>;
}
