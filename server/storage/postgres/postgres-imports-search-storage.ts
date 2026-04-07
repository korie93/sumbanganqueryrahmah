import type {
  DataRow,
  Import,
  InsertDataRow,
  InsertImport,
} from "../../../shared/schema-postgres";
import { logger } from "../../lib/logger";
import { PostgresAuthAccountStorage } from "./postgres-auth-account-storage";
import { STORAGE_DEBUG_LOGS } from "./postgres-storage-core";
import type { SearchDataRow, SearchGlobalDataRow } from "../../repositories/search.repository";

export class PostgresImportsSearchStorage extends PostgresAuthAccountStorage {
  async searchGlobalDataRows(params: {
    search: string;
    limit: number;
    offset: number;
  }): Promise<{ rows: SearchGlobalDataRow[]; total: number }> {
    return this.searchRepository.searchGlobalDataRows(params);
  }

  async searchSimpleDataRows(search: string) {
    return this.searchRepository.searchSimpleDataRows(search);
  }

  async createImport(data: InsertImport & { createdBy?: string }): Promise<Import> {
    return this.importsRepository.createImport(data);
  }

  async getImports(): Promise<Import[]> {
    return this.importsRepository.getImports();
  }

  async getImportById(id: string): Promise<Import | undefined> {
    return this.importsRepository.getImportById(id);
  }

  async updateImportName(id: string, name: string): Promise<Import | undefined> {
    return this.importsRepository.updateImportName(id, name);
  }

  async deleteImport(id: string): Promise<boolean> {
    return this.importsRepository.deleteImport(id);
  }

  async createDataRow(data: InsertDataRow): Promise<DataRow> {
    return this.importsRepository.createDataRow(data);
  }

  async getDataRowsByImport(importId: string): Promise<DataRow[]> {
    if (STORAGE_DEBUG_LOGS) {
      logger.debug("Viewer import ID received", { importId });
    }
    const rows = await this.importsRepository.getDataRowsByImport(importId);

    if (STORAGE_DEBUG_LOGS) {
      logger.debug("Viewer row count", { importId, rowCount: rows.length });
    }

    return rows;
  }

  async getDataRowCountByImport(importId: string): Promise<number> {
    return this.importsRepository.getDataRowCountByImport(importId);
  }

  async searchDataRows(params: {
    importId: string;
    search?: string | null;
    limit: number;
    offset: number;
    columnFilters?: Array<{ column: string; operator: string; value: string }>;
    cursor?: string | null;
  }): Promise<{ rows: SearchDataRow[]; total: number; nextCursorRowId: string | null }> {
    const trimmedSearch = params.search && params.search.trim() ? params.search.trim() : null;

    if (STORAGE_DEBUG_LOGS) {
      logger.debug("searchDataRows called", {
        importId: params.importId,
        search: params.search ?? null,
        trimmedSearch,
        limit: params.limit,
        offset: params.offset,
        columnFilterCount: params.columnFilters?.length ?? 0,
        hasCursor: Boolean(params.cursor),
      });
    }

    const result = await this.searchRepository.searchDataRows(params);

    if (STORAGE_DEBUG_LOGS) {
      logger.debug("searchDataRows results", {
        importId: params.importId,
        rowCount: result.rows.length,
        total: result.total,
      });
    }

    return result;
  }

  async advancedSearchDataRows(
    filters: Array<{ field: string; operator: string; value: string }>,
    logic: "AND" | "OR",
    limit: number,
    offset: number,
  ): Promise<{ rows: DataRow[]; total: number }> {
    return this.searchRepository.advancedSearchDataRows(filters, logic, limit, offset);
  }

  async getAllColumnNames(): Promise<string[]> {
    return this.searchRepository.getAllColumnNames();
  }
}
