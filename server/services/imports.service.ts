import type { DataRow, Import, InsertDataRow } from "../../shared/schema-postgres";
import { ensureObject } from "../http/validation";
import type {
  ImportListPage,
  ImportsRepository,
  ImportWithRowCount,
} from "../repositories/imports.repository";
import type { ImportAnalysisService } from "./import-analysis.service";
import type { PostgresStorage } from "../storage-postgres";

const IMPORT_INSERT_CHUNK_SIZE = 20;

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

type CreateImportInput = {
  name: string;
  filename: string;
  dataRows: unknown[];
  createdBy?: string;
};

type ImportDataPageInput = {
  importId: string;
  page: number;
  requestedLimit: number;
  viewerRowsPerPage: number;
  isDbProtected: boolean;
  search?: string | null;
};

type SearchImportRowsInput = {
  importId: string;
  limit: number;
  offset: number;
  search?: string | null;
};

type ImportDetailsResult = {
  import: Import;
  rows: DataRow[];
};

type ListImportsInput = {
  cursor?: string | null;
  limit?: number;
  search?: string | null;
  createdOn?: string | null;
};

type ImportDataPageResult = {
  rows: Array<{
    id: string;
    importId: string;
    jsonDataJsonb: unknown;
  }>;
  total: number;
  page: number;
  limit: number;
};

export class ImportsService {
  constructor(
    private readonly storage: ImportsStorage,
    private readonly importsRepository: Pick<ImportsRepository, "getImportsWithRowCounts" | "listImportsWithRowCountsPage">,
    private readonly importAnalysisService: Pick<ImportAnalysisService, "analyzeAll" | "analyzeImport">,
  ) {}

  async searchImportRows(params: SearchImportRowsInput): Promise<SearchDataRowsResult> {
    return this.storage.searchDataRows({
      importId: params.importId,
      search: params.search ?? "",
      limit: params.limit,
      offset: params.offset,
    });
  }

  async listImports(params: ListImportsInput = {}): Promise<ImportListPage> {
    return this.importsRepository.listImportsWithRowCountsPage(params);
  }

  async createImport(params: CreateImportInput): Promise<Import> {
    const importRecord = await this.storage.createImport({
      name: params.name,
      filename: params.filename,
      createdBy: params.createdBy,
    });

    for (let index = 0; index < params.dataRows.length; index += IMPORT_INSERT_CHUNK_SIZE) {
      const chunk = params.dataRows.slice(index, index + IMPORT_INSERT_CHUNK_SIZE);
      await Promise.all(
        chunk.map((row) =>
          this.storage.createDataRow({
            importId: importRecord.id,
            jsonDataJsonb: this.normalizeImportRow(row),
          }),
        ),
      );
    }

    if (params.createdBy) {
      await this.storage.createAuditLog({
        action: "IMPORT_DATA",
        performedBy: params.createdBy,
        targetResource: params.name,
        details: `Imported ${params.dataRows.length} rows from ${params.filename}`,
      });
    }

    return importRecord;
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

  async getImportDataPage(params: ImportDataPageInput): Promise<ImportDataPageResult> {
    const maxLimit = Math.min(params.isDbProtected ? 120 : 500, params.viewerRowsPerPage);
    const limit = Math.max(10, Math.min(params.requestedLimit, maxLimit));
    const offset = (params.page - 1) * limit;
    const search = String(params.search || "").trim();
    const result = await this.storage.searchDataRows({
      importId: params.importId,
      search: search || null,
      limit,
      offset,
    });

    return {
      rows: (result.rows || []).map((row) => ({
        id: row.id,
        importId: row.importId,
        jsonDataJsonb: row.jsonDataJsonb,
      })),
      total: result.total || 0,
      page: params.page,
      limit,
    };
  }

  async analyzeImport(importId: string): Promise<AnalyzeImportResult | null> {
    const importRecord = await this.storage.getImportById(importId);
    if (!importRecord) {
      return null;
    }

    return this.importAnalysisService.analyzeImport(importRecord);
  }

  async analyzeAll(): Promise<AnalyzeAllImportsResult> {
    const imports = await this.importsRepository.getImportsWithRowCounts();
    return this.importAnalysisService.analyzeAll(imports);
  }

  async renameImport(importId: string, name: string, updatedBy?: string): Promise<Import | null> {
    const updated = await this.storage.updateImportName(importId, name);
    if (!updated) {
      return null;
    }

    if (updatedBy) {
      await this.storage.createAuditLog({
        action: "UPDATE_IMPORT",
        performedBy: updatedBy,
        targetResource: name,
      });
    }

    return updated;
  }

  async deleteImport(importId: string, deletedBy?: string): Promise<boolean> {
    const importRecord = await this.storage.getImportById(importId);
    const deleted = await this.storage.deleteImport(importId);
    if (!deleted) {
      return false;
    }

    if (deletedBy) {
      await this.storage.createAuditLog({
        action: "DELETE_IMPORT",
        performedBy: deletedBy,
        targetResource: importRecord?.name || importId,
      });
    }

    return true;
  }

  parseCreateImportBody(bodyRaw: unknown): { name: string; filename: string; dataRows: unknown[] } {
    const body = ensureObject(bodyRaw) || {};
    const name = String(body.name ?? "");
    const filename = String(body.filename ?? "");
    const dataRows = Array.isArray(body.rows) ? body.rows : (Array.isArray(body.data) ? body.data : []);

    return {
      name,
      filename,
      dataRows,
    };
  }

  parseRenameBody(bodyRaw: unknown): { name: string } {
    const body = ensureObject(bodyRaw) || {};
    return {
      name: String(body.name ?? ""),
    };
  }

  private normalizeImportRow(row: unknown): InsertDataRow["jsonDataJsonb"] {
    const normalized = ensureObject(row);
    if (!normalized) {
      throw new Error("Invalid jsonDataJsonb");
    }

    return normalized;
  }
}
