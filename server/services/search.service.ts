import type { DataRow } from "../../shared/schema-postgres";
import { buildOffsetPaginationMeta } from "../http/pagination";
import type { SearchRepository } from "../repositories/search.repository";
import {
  buildSearchCollectionStatusCandidates,
  buildSearchCollectionStatuses,
} from "./search-collection-status-utils";
import type { SearchCollectionViewerScope } from "../repositories/search-repository-types";
import { enrichSavedRowLocation } from "../lib/saved-row-location-enrichment";
import { badRequest, notFound } from "../http/errors";
import {
  decodeSearchCollectionHistoryKey,
  encodeSearchCollectionHistoryKey,
} from "./search-collection-history-key";

type SearchGlobalRow = {
  id?: string | null;
  importId?: string | null;
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
  | "findCollectionStatusesForRows"
  | "findCollectionHistoryForRow"
  | "findCollectionHistorySourceRow"
  | "getAllColumnNames"
  | "searchGlobalDataRows"
  | "searchSimpleDataRows"
>;

type SearchGlobalRepositoryResult = Awaited<ReturnType<SearchRepositoryPort["searchGlobalDataRows"]>>;

function buildRowsWithSource(params: {
  rows: SearchGlobalRow[];
  statuses: ReturnType<typeof buildSearchCollectionStatuses>;
  includeSourceDetails: boolean;
}) {
  return params.rows.map((row) => {
    const base = enrichSavedRowLocation(row.jsonDataJsonb) ?? {};
    const rowId = String(row.id || "").trim();
    return {
      ...base,
      ...(params.includeSourceDetails
        ? { "Source File": row.importFilename || row.importName || "" }
        : {}),
      _collectionStatus: (() => {
        const status = params.statuses.get(rowId);
        if (status) {
          const sourceImportId = String(row.importId || "").trim();
          return {
            ...status,
            ...((status.state === "recorded" || status.state === "historical")
              && rowId
              && sourceImportId
              ? {
                  historyKey: encodeSearchCollectionHistoryKey({
                    sourceDataRowId: rowId,
                    sourceImportId,
                  }),
                }
              : {}),
          };
        }
        return {
        state: "unavailable",
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
        };
      })(),
    };
  });
}

function collectColumns(rows: Array<Record<string, unknown>>) {
  return Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => {
        if (!key.startsWith("_")) set.add(key);
      });
      return set;
    }, new Set<string>()),
  );
}

export class SearchService {
  constructor(private readonly searchRepository: SearchRepositoryPort) {}

  private async enrichRowsWithCollectionStatus(
    rows: SearchGlobalRow[],
    includeSourceDetails: boolean,
    collectionViewerScope: SearchCollectionViewerScope,
  ) {
    const candidates = buildSearchCollectionStatusCandidates(rows);
    const matches = candidates.length > 0
      ? await this.searchRepository.findCollectionStatusesForRows(candidates, collectionViewerScope)
      : [];
    const statuses = buildSearchCollectionStatuses({
      rows,
      candidates,
      matches,
      includeSourceDetails,
    });

    return buildRowsWithSource({ rows, statuses, includeSourceDetails });
  }

  async getColumns() {
    return this.searchRepository.getAllColumnNames();
  }

  async getCollectionHistory(params: {
    historyKey: string;
    page: number;
    pageSize: number;
    includeManualAuditDetails: boolean;
    includeSourceDetails: boolean;
    collectionViewerScope: SearchCollectionViewerScope;
  }) {
    const identity = decodeSearchCollectionHistoryKey(params.historyKey);
    if (!identity) {
      throw badRequest("Invalid collection history key.");
    }

    const sourceRow = await this.searchRepository.findCollectionHistorySourceRow(identity);
    if (!sourceRow) {
      throw notFound("Collection history source was not found.");
    }

    const candidate = buildSearchCollectionStatusCandidates([sourceRow])[0] ?? {
      rowId: sourceRow.id,
      sourceImportId: sourceRow.importId,
      icHash: null,
      icValue: null,
      phoneHash: null,
      phoneValue: null,
      accountHashes: [],
      accountValues: [],
    };
    return this.searchRepository.findCollectionHistoryForRow({
      candidate,
      sourceObligationKey: sourceRow.sourceObligationKey,
      viewerScope: params.collectionViewerScope,
      includeManualAuditDetails: params.includeManualAuditDetails,
      includeSourceDetails: params.includeSourceDetails,
      page: params.page,
      pageSize: params.pageSize,
    });
  }

  async searchGlobal(params: {
    search: string;
    page: number;
    requestedLimit: number;
    maxTotal: number;
    isDbProtected: boolean;
    includeSourceDetails: boolean;
    collectionViewerScope: SearchCollectionViewerScope;
  }) {
    const normalizedSearch = String(params.search || "").trim();
    const maxLimit = params.isDbProtected ? Math.min(params.maxTotal, 80) : params.maxTotal;
    const limit = Math.max(10, Math.min(params.requestedLimit, maxLimit));
    const offset = (params.page - 1) * limit;
    const buildPagination = (total: number) => buildOffsetPaginationMeta({
      page: params.page,
      limit,
      total,
      offset,
    });

    if (offset >= params.maxTotal) {
      return {
        columns: [],
        rows: [],
        results: [],
        total: params.maxTotal,
        totalIsApproximate: false,
        page: params.page,
        limit,
        pageSize: limit,
        offset,
        pagination: buildPagination(params.maxTotal),
      };
    }

    if (normalizedSearch.length < 2) {
      return {
        columns: [],
        rows: [],
        results: [],
        total: 0,
        totalIsApproximate: false,
        page: params.page,
        limit,
        pageSize: limit,
        offset,
        pagination: buildPagination(0),
      };
    }

    const effectiveLimit = Math.min(limit, Math.max(1, params.maxTotal - offset));
    const result: SearchGlobalRepositoryResult = await this.searchRepository.searchGlobalDataRows({
      search: normalizedSearch,
      limit: effectiveLimit,
      offset,
    });

    const parsedRows = await this.enrichRowsWithCollectionStatus(
      result.rows as SearchGlobalRow[],
      params.includeSourceDetails,
      params.collectionViewerScope,
    );
    const columns = collectColumns(parsedRows);

    return {
      columns,
      rows: parsedRows,
      results: parsedRows,
      total: Math.min(result.total, params.maxTotal),
      totalIsApproximate: Boolean(result.totalIsApproximate && result.total < params.maxTotal),
      page: params.page,
      limit: effectiveLimit,
      pageSize: effectiveLimit,
      offset,
      pagination: buildOffsetPaginationMeta({
        page: params.page,
        limit: effectiveLimit,
        total: Math.min(result.total, params.maxTotal),
        offset,
      }),
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
      ...(enrichSavedRowLocation(row.jsonDataJsonb) || {}),
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
    includeSourceDetails: boolean;
    collectionViewerScope: SearchCollectionViewerScope;
  }) {
    const limit = Math.max(10, Math.min(params.requestedLimit, params.maxTotal));
    const offset = (params.page - 1) * limit;
    const buildPagination = (total: number) => buildOffsetPaginationMeta({
      page: params.page,
      limit,
      total,
      offset,
    });

    if (offset >= params.maxTotal) {
      return {
        results: [],
        headers: [],
        total: params.maxTotal,
        page: params.page,
        limit,
        pageSize: limit,
        offset,
        pagination: buildPagination(params.maxTotal),
      };
    }

    const effectiveLimit = Math.min(limit, Math.max(1, params.maxTotal - offset));
    const rawResult = await this.searchRepository.advancedSearchDataRows(
      params.filters,
      params.logic,
      effectiveLimit,
      offset,
    );

    const parsedResults = await this.enrichRowsWithCollectionStatus(
      rawResult.rows as AdvancedSearchRow[],
      params.includeSourceDetails,
      params.collectionViewerScope,
    );
    const headers = collectColumns(parsedResults);

    return {
      results: parsedResults,
      headers,
      total: Math.min(rawResult.total || 0, params.maxTotal),
      page: params.page,
      limit: effectiveLimit,
      pageSize: effectiveLimit,
      offset,
      pagination: buildOffsetPaginationMeta({
        page: params.page,
        limit: effectiveLimit,
        total: Math.min(rawResult.total || 0, params.maxTotal),
        offset,
      }),
    };
  }
}
