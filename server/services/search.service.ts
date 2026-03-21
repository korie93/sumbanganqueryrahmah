import type { DataRow } from "../../shared/schema-postgres";
import type { SearchRepository } from "../repositories/search.repository";

type SearchGlobalRow = {
  jsonDataJsonb?: unknown;
  importFilename?: string | null;
  importName?: string | null;
};

type SearchSimpleRow = {
  jsonDataJsonb?: Record<string, unknown> | null;
  importId?: string;
  importName?: string | null;
};

type AdvancedSearchRow = DataRow & {
  importName?: string | null;
  importFilename?: string | null;
};

type SearchRepositoryPort = Pick<
  SearchRepository,
  | "advancedSearchDataRows"
  | "getAllColumnNames"
  | "searchGlobalDataRows"
  | "searchSimpleDataRows"
>;

function buildRowsWithSource(rows: SearchGlobalRow[]) {
  return rows.map((row) => {
    const base = row.jsonDataJsonb && typeof row.jsonDataJsonb === "object"
      ? row.jsonDataJsonb as Record<string, unknown>
      : {};
    return {
      ...base,
      "Source File": row.importFilename || row.importName || "",
    };
  });
}

function collectColumns(rows: Array<Record<string, unknown>>) {
  return Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => set.add(key));
      return set;
    }, new Set<string>()),
  );
}

export class SearchService {
  constructor(private readonly searchRepository: SearchRepositoryPort) {}

  async getColumns() {
    return this.searchRepository.getAllColumnNames();
  }

  async searchGlobal(params: {
    search: string;
    page: number;
    requestedLimit: number;
    maxTotal: number;
    isDbProtected: boolean;
  }) {
    const normalizedSearch = String(params.search || "").trim();
    const maxLimit = params.isDbProtected ? Math.min(params.maxTotal, 80) : params.maxTotal;
    const limit = Math.max(10, Math.min(params.requestedLimit, maxLimit));
    const offset = (params.page - 1) * limit;

    if (offset >= params.maxTotal) {
      return {
        columns: [],
        rows: [],
        results: [],
        total: params.maxTotal,
        page: params.page,
        limit,
      };
    }

    if (normalizedSearch.length < 2) {
      return {
        columns: [],
        rows: [],
        results: [],
        total: 0,
      };
    }

    const effectiveLimit = Math.min(limit, Math.max(1, params.maxTotal - offset));
    const result = await this.searchRepository.searchGlobalDataRows({
      search: normalizedSearch,
      limit: effectiveLimit,
      offset,
    });

    const parsedRows = buildRowsWithSource(result.rows as SearchGlobalRow[]);
    const columns = collectColumns(parsedRows);

    return {
      columns,
      rows: parsedRows,
      results: parsedRows,
      total: Math.min(result.total, params.maxTotal),
      page: params.page,
      limit: effectiveLimit,
    };
  }

  async searchSimple(search: string) {
    const normalizedSearch = String(search || "").trim();
    if (normalizedSearch.length < 2) {
      return { results: [], total: 0 };
    }

    const queryResult = await this.searchRepository.searchSimpleDataRows(normalizedSearch);
    const rows = ((queryResult as { rows?: SearchSimpleRow[] }).rows || []);
    const results = rows.map((row) => ({
      ...(row.jsonDataJsonb || {}),
      _importId: row.importId,
      _importName: row.importName,
    }));

    return {
      results,
      total: results.length,
    };
  }

  async advancedSearch(params: {
    filters: Array<{ field: string; operator: string; value: string }>;
    logic: "AND" | "OR";
    page: number;
    requestedLimit: number;
    maxTotal: number;
  }) {
    const limit = Math.max(10, Math.min(params.requestedLimit, params.maxTotal));
    const offset = (params.page - 1) * limit;

    if (offset >= params.maxTotal) {
      return {
        results: [],
        headers: [],
        total: params.maxTotal,
        page: params.page,
        limit,
      };
    }

    const effectiveLimit = Math.min(limit, Math.max(1, params.maxTotal - offset));
    const rawResult = await this.searchRepository.advancedSearchDataRows(
      params.filters,
      params.logic,
      effectiveLimit,
      offset,
    );

    const parsedResults = buildRowsWithSource(rawResult.rows as AdvancedSearchRow[]);
    const headers = collectColumns(parsedResults);

    return {
      results: parsedResults,
      headers,
      total: Math.min(rawResult.total || 0, params.maxTotal),
      page: params.page,
      limit: effectiveLimit,
    };
  }
}
