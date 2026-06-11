import type {
  CreateImportFromCsvFileInput,
  CreateImportInput,
  ImportsServiceStorage,
} from "./imports-service-types";
import { runtimeConfig } from "../config/runtime";
import { forEachCsvFileRow } from "./import-upload-csv-utils";
import { ImportUploadValidationError } from "./import-upload-file-utils";
import { normalizeImportRow } from "./imports-service-parsers";
import { ERROR_CODES } from "../../shared/error-codes";

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

export class ImportsServiceMutationOperations {
  constructor(private readonly storage: ImportsServiceStorage) {}

  async createImport(params: CreateImportInput) {
    const insertChunkSize = resolveImportInsertChunkSize();
    const rowByteBudget = resolveImportRowByteBudget();
    const importRecord = await this.storage.createImport({
      name: params.name,
      filename: params.filename,
      ...(params.createdBy ? { createdBy: params.createdBy } : {}),
    });

    try {
      for (let index = 0; index < params.dataRows.length; index += insertChunkSize) {
        const chunk = params.dataRows.slice(index, index + insertChunkSize);
        await Promise.all(
          chunk.map((row) =>
            this.storage.createDataRow({
              importId: importRecord.id,
              jsonDataJsonb: normalizeBoundedImportRow(row, rowByteBudget),
            }),
          ),
        );
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

    return importRecord;
  }

  async createImportFromCsvFile(params: CreateImportFromCsvFileInput) {
    const insertChunkSize = resolveImportInsertChunkSize();
    const rowByteBudget = resolveImportRowByteBudget();
    const importRecord = await this.storage.createImport({
      name: params.name,
      filename: params.filename,
      ...(params.createdBy ? { createdBy: params.createdBy } : {}),
    });

    let pendingRows: unknown[] = [];
    const flushPendingRows = async () => {
      if (pendingRows.length === 0) {
        return;
      }

      const chunk = pendingRows;
      pendingRows = [];
      await Promise.all(
        chunk.map((row) =>
          this.storage.createDataRow({
            importId: importRecord.id,
            jsonDataJsonb: normalizeBoundedImportRow(row, rowByteBudget),
          }),
        ),
      );
    };

    let parsed: Awaited<ReturnType<typeof forEachCsvFileRow>>;
    try {
      parsed = await forEachCsvFileRow(
        params.filePath,
        async (row) => {
          assertImportRowByteBudget(row, rowByteBudget);
          pendingRows.push(row);
          if (pendingRows.length >= insertChunkSize) {
            await flushPendingRows();
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
    } catch (error) {
      await this.storage.deleteDataRowsByImport(importRecord.id);
      await this.storage.deleteImport(importRecord.id);
      throw error;
    }

    if (parsed.rowCount <= 0) {
      await this.storage.deleteDataRowsByImport(importRecord.id);
      await this.storage.deleteImport(importRecord.id);
      throw new ImportUploadValidationError(
        "No data rows provided",
        ERROR_CODES.IMPORT_PARSE_FAILED,
      );
    }

    if (params.createdBy) {
      await this.storage.createAuditLog({
        action: "IMPORT_DATA",
        performedBy: params.createdBy,
        targetResource: params.name,
        details: `Imported ${parsed.rowCount} rows from ${params.filename}`,
      });
    }

    return importRecord;
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
