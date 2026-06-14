import type {
  AnalyzeAllImportsResult,
  AnalyzeImportResult,
  ImportDataPageInput,
  ImportDataPageResult,
  ImportDetailsResult,
  ImportSummaryResult,
  ImportsServiceAnalysis,
  ImportsServiceRepository,
  ImportsServiceStorage,
  ListImportsInput,
  SearchDataRowsResult,
  SearchImportRowsInput,
} from "./imports-service-types";
import { encodeImportDataPageCursor, parseImportDataPageCursor } from "./imports-service-parsers";

export class ImportsServiceReadOperations {
  constructor(
    private readonly storage: ImportsServiceStorage,
    private readonly importsRepository: ImportsServiceRepository,
    private readonly importAnalysisService: ImportsServiceAnalysis,
  ) {}

  async searchImportRows(params: SearchImportRowsInput): Promise<SearchDataRowsResult> {
    return this.storage.searchDataRows({
      importId: params.importId,
      search: params.search ?? "",
      limit: params.limit,
      offset: params.offset,
      columnFilters: params.columnFilters ?? [],
      cursor: params.cursor ?? null,
    });
  }

  async listImports(params: ListImportsInput = {}) {
    if (typeof params.page === "number") {
      return this.importsRepository.listImportsWithRowCountsOffsetPage({
        page: params.page,
        pageSize: params.pageSize,
        search: params.search,
        createdBy: params.createdBy,
        createdOn: params.createdOn,
        minRows: params.minRows,
        maxRows: params.maxRows,
        view: params.view,
      });
    }
    return this.importsRepository.listImportsWithRowCountsPage(params);
  }

  async getImportDetails(importId: string): Promise<ImportDetailsResult | null> {
    const importRecord = await this.storage.getImportById(importId);
    if (!importRecord) {
      return null;
    }

    const rows = await this.storage.getDataRowsByImport(importId);
    return {
      import: importRecord,
      rows,
    };
  }

  async getImportSummary(importId: string): Promise<ImportSummaryResult | null> {
    const importRecord = await this.storage.getImportById(importId);
    if (!importRecord) {
      return null;
    }

    const [rowCount, columns] = await Promise.all([
      this.importsRepository.getDataRowCountByImport(importId),
      this.importsRepository.getImportColumnNames(importId),
    ]);
    return {
      import: {
        ...importRecord,
        rowCount,
      },
      columns,
      columnCount: columns.length,
    };
  }

  async getImportDataPage(params: ImportDataPageInput): Promise<ImportDataPageResult> {
    const maxLimit = Math.min(params.isDbProtected ? 120 : 500, params.viewerRowsPerPage);
    const limit = Math.max(10, Math.min(params.requestedLimit, maxLimit));
    const parsedCursor = parseImportDataPageCursor(params.cursor);
    if (params.cursor && !parsedCursor) {
      throw new Error("Invalid import data cursor.");
    }

    const effectivePage = parsedCursor?.page ?? params.page;
    const offset = parsedCursor ? 0 : (params.page - 1) * limit;
    const search = String(params.search || "").trim();
    const [result, headers] = await Promise.all([
      this.storage.searchDataRows({
        importId: params.importId,
        search: search || null,
        limit,
        offset,
        columnFilters: params.columnFilters ?? [],
        cursor: parsedCursor?.lastRowId ?? null,
      }),
      this.importsRepository.getImportColumnNames(params.importId),
      this.importsRepository.markImportOpened(params.importId),
    ]);

    const nextCursor = result.nextCursorRowId
      ? encodeImportDataPageCursor({
          lastRowId: result.nextCursorRowId,
          page: effectivePage + 1,
        })
      : null;
    const logicalOffset = Math.max(0, (effectivePage - 1) * limit);
    const total = result.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const resolvedHeaders = headers.length > 0
      ? headers
      : Array.from(
          new Set(
            (result.rows || []).flatMap((row) => {
              const record = row?.jsonDataJsonb;
              if (!record || typeof record !== "object" || Array.isArray(record)) {
                return [];
              }

              return Object.keys(record as Record<string, unknown>)
                .map((key) => String(key || "").trim())
                .filter(Boolean);
            }),
          ),
        );

    return {
      rows: (result.rows || []).map((row) => ({
        id: row.id,
        importId: row.importId,
        jsonDataJsonb: row.jsonDataJsonb,
      })),
      headers: resolvedHeaders,
      total: result.total || 0,
      page: effectivePage,
      limit,
      pageSize: limit,
      offset: logicalOffset,
      nextCursor,
      pagination: {
        mode: "hybrid",
        page: effectivePage,
        pageSize: limit,
        limit,
        offset: logicalOffset,
        total,
        totalPages,
        nextCursor,
        hasNextPage: nextCursor !== null,
        hasPreviousPage: effectivePage > 1,
      },
    };
  }

  async analyzeImport(importId: string, signal?: AbortSignal): Promise<AnalyzeImportResult | null> {
    const importRecord = await this.storage.getImportById(importId);
    if (!importRecord) {
      return null;
    }

    await this.importsRepository.markImportOpened(importId);
    return this.importAnalysisService.analyzeImport(importRecord, signal);
  }

  async analyzeAll(signal?: AbortSignal): Promise<AnalyzeAllImportsResult> {
    const imports = await this.importsRepository.getImportsWithRowCounts();
    return this.importAnalysisService.analyzeAll(imports, signal);
  }
}
