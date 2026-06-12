import type {
  CreateImportFromCsvFileInput,
  CreateImportInput,
  ImportsServiceStorage,
} from "./imports-service-types";
import { runtimeConfig } from "../config/runtime";
import { forEachCsvFileRow, inspectCsvFile } from "./import-upload-csv-utils";
import { ImportUploadValidationError } from "./import-upload-file-utils";
import { normalizeImportRow } from "./imports-service-parsers";
import { ERROR_CODES } from "../../shared/error-codes";
import {
  applyImportColumnMapping,
  validateImportColumnMappingSources,
} from "./import-column-mapping";
import { DuplicateImportError, ImportJobCancelledError } from "./import-operation-errors";

const IMPORT_INSERT_CHUNK_SIZE = 20;
const DEFAULT_IMPORT_ROW_BYTE_BUDGET = 64 * 1024;

function resolveImportInsertChunkSize() {
  return Math.max(
    1,
    Math.trunc(Number(runtimeConfig.runtime.importInsertBatchSize) || IMPORT_INSERT_CHUNK_SIZE),
  );
}

function resolveImportRowByteBudget() {
  return Math.max(
    1,
    Math.trunc(Number(runtimeConfig.runtime.importMaxRowBytes) || DEFAULT_IMPORT_ROW_BYTE_BUDGET),
  );
}

function assertImportRowByteBudget(row: unknown, maxBytes: number) {
  let serialized: string;
  try {
    serialized = JSON.stringify(row ?? {});
  } catch {
    throw new ImportUploadValidationError(
      "Import row contains unsupported data.",
      ERROR_CODES.IMPORT_PARSE_FAILED,
    );
  }

  const rowBytes = Buffer.byteLength(serialized, "utf8");
  if (rowBytes > maxBytes) {
    throw new ImportUploadValidationError(
      `Import row exceeds the configured ${maxBytes.toLocaleString("en-US")} byte safety limit. Split or trim oversized cells before uploading.`,
      ERROR_CODES.IMPORT_PARSE_FAILED,
    );
  }
}

function normalizeBoundedImportRow(row: unknown, maxBytes: number) {
  assertImportRowByteBudget(row, maxBytes);
  const normalized = normalizeImportRow(row);
  assertImportRowByteBudget(normalized, maxBytes);
  return normalized;
}

async function insertImportRows(
  storage: ImportsServiceStorage,
  importId: string,
  rows: unknown[],
  rowByteBudget: number,
) {
  const normalizedRows = rows.map((row) => ({
    importId,
    jsonDataJsonb: normalizeBoundedImportRow(row, rowByteBudget),
  }));
  await storage.createDataRows(normalizedRows);
}

export class ImportsServiceMutationOperations {
  constructor(private readonly storage: ImportsServiceStorage) {}

  private async assertNotDuplicate(params: {
    createdBy?: string | undefined;
    contentHashSha256?: string | undefined;
  }): Promise<void> {
    if (!params.createdBy || !params.contentHashSha256) {
      return;
    }

    const existingImport = await this.storage.findActiveImportByContentHash(
      params.createdBy,
      params.contentHashSha256,
    );
    if (existingImport) {
      throw new DuplicateImportError(existingImport);
    }
  }

  private async createImportRecord(params: {
    name: string;
    filename: string;
    createdBy?: string | undefined;
    contentHashSha256?: string | undefined;
    sourceSizeBytes?: number | undefined;
  }) {
    try {
      return await this.storage.createImport({
        name: params.name,
        filename: params.filename,
        ...(params.createdBy ? { createdBy: params.createdBy } : {}),
        ...(params.contentHashSha256 ? { contentHashSha256: params.contentHashSha256 } : {}),
        ...(params.sourceSizeBytes !== undefined ? { sourceSizeBytes: params.sourceSizeBytes } : {}),
      });
    } catch (error) {
      const errorCode = typeof error === "object" && error !== null && "code" in error
        ? String(error.code)
        : "";
      if (errorCode === "23505" && params.createdBy && params.contentHashSha256) {
        const existingImport = await this.storage.findActiveImportByContentHash(
          params.createdBy,
          params.contentHashSha256,
        );
        if (existingImport) {
          throw new DuplicateImportError(existingImport);
        }
      }
      throw error;
    }
  }

  async createImport(params: CreateImportInput) {
    const insertChunkSize = resolveImportInsertChunkSize();
    const rowByteBudget = resolveImportRowByteBudget();
    const firstRow = params.dataRows.find(
      (row): row is Record<string, unknown> => Boolean(row && typeof row === "object" && !Array.isArray(row)),
    );
    validateImportColumnMappingSources(
      firstRow ? Object.keys(firstRow) : [],
      params.columnMapping ?? [],
    );
    await this.assertNotDuplicate(params);
    const importRecord = await this.createImportRecord(params);

    try {
      for (let index = 0; index < params.dataRows.length; index += insertChunkSize) {
        const chunk = params.dataRows
          .slice(index, index + insertChunkSize)
          .map((row) => applyImportColumnMapping(
            normalizeImportRow(row) as Record<string, string>,
            params.columnMapping ?? [],
          ));
        await insertImportRows(this.storage, importRecord.id, chunk, rowByteBudget);
      }
    } catch (error) {
      await this.storage.deleteDataRowsByImport(importRecord.id);
      await this.storage.deleteImport(importRecord.id);
      throw error;
    }

    if (params.createdBy) {
      await this.storage.createAuditLog({
        action: "IMPORT_DATA",
        performedBy: params.createdBy,
        targetResource: params.name,
        details: `Imported ${params.dataRows.length} rows from ${params.filename}`,
      });
    }

    return {
      ...importRecord,
      rowCount: params.dataRows.length,
    };
  }

  async createImportFromCsvFile(params: CreateImportFromCsvFileInput) {
    const insertChunkSize = resolveImportInsertChunkSize();
    const rowByteBudget = resolveImportRowByteBudget();
    const inspection = await inspectCsvFile(params.filePath, {
      maxRows: runtimeConfig.runtime.importCsvMaxRows,
      maxColumns: runtimeConfig.runtime.importMaxColumns,
      maxCellLength: runtimeConfig.runtime.importMaxCellLength,
    });
    if (inspection.error) {
      throw new ImportUploadValidationError(
        inspection.error,
        ERROR_CODES.IMPORT_PARSE_FAILED,
      );
    }
    validateImportColumnMappingSources(inspection.headers, params.columnMapping ?? []);
    if (inspection.rowCount <= 0) {
      throw new ImportUploadValidationError(
        "No data rows provided",
        ERROR_CODES.IMPORT_PARSE_FAILED,
      );
    }

    await this.assertNotDuplicate(params);
    const importRecord = await this.createImportRecord(params);

    let pendingRows: unknown[] = [];
    const flushPendingRows = async () => {
      if (pendingRows.length === 0) {
        return;
      }

      const chunk = pendingRows;
      pendingRows = [];
      await insertImportRows(this.storage, importRecord.id, chunk, rowByteBudget);
    };

    let parsed: Awaited<ReturnType<typeof forEachCsvFileRow>>;
    try {
      let processedRows = 0;
      parsed = await forEachCsvFileRow(
        params.filePath,
        async (row) => {
          if (await params.shouldCancel?.()) {
            throw new ImportJobCancelledError();
          }
          const mappedRow = applyImportColumnMapping(row, params.columnMapping ?? []);
          assertImportRowByteBudget(mappedRow, rowByteBudget);
          pendingRows.push(mappedRow);
          processedRows += 1;
          if (pendingRows.length >= insertChunkSize) {
            await flushPendingRows();
            await params.onProgress?.(processedRows, inspection.rowCount);
          }
        },
        {
          maxRows: runtimeConfig.runtime.importCsvMaxRows,
          maxColumns: runtimeConfig.runtime.importMaxColumns,
          maxCellLength: runtimeConfig.runtime.importMaxCellLength,
        },
      );

      if (parsed.error) {
        throw new ImportUploadValidationError(
          parsed.error,
          ERROR_CODES.IMPORT_PARSE_FAILED,
        );
      }

      await flushPendingRows();
      await params.onProgress?.(parsed.rowCount, inspection.rowCount);
    } catch (error) {
      await this.storage.deleteDataRowsByImport(importRecord.id);
      await this.storage.deleteImport(importRecord.id);
      throw error;
    }

    if (params.createdBy) {
      await this.storage.createAuditLog({
        action: "IMPORT_DATA",
        performedBy: params.createdBy,
        targetResource: params.name,
        details: `Imported ${parsed.rowCount} rows from ${params.filename}`,
      });
    }

    return {
      ...importRecord,
      rowCount: parsed.rowCount,
    };
  }

  async renameImport(importId: string, name: string, updatedBy?: string) {
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

  async deleteImport(importId: string, deletedBy?: string) {
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
}
