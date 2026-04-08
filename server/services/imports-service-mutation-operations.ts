import type {
  CreateImportInput,
  ImportsServiceStorage,
} from "./imports-service-types";
import { normalizeImportRow } from "./imports-service-parsers";

const IMPORT_INSERT_CHUNK_SIZE = 20;

export class ImportsServiceMutationOperations {
  constructor(private readonly storage: ImportsServiceStorage) {}

  async createImport(params: CreateImportInput) {
    const importRecord = await this.storage.createImport({
      name: params.name,
      filename: params.filename,
      ...(params.createdBy ? { createdBy: params.createdBy } : {}),
    });

    for (let index = 0; index < params.dataRows.length; index += IMPORT_INSERT_CHUNK_SIZE) {
      const chunk = params.dataRows.slice(index, index + IMPORT_INSERT_CHUNK_SIZE);
      await Promise.all(
        chunk.map((row) =>
          this.storage.createDataRow({
            importId: importRecord.id,
            jsonDataJsonb: normalizeImportRow(row),
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
