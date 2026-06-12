import type { Import } from "../../shared/schema-postgres";

export class DuplicateImportError extends Error {
  constructor(readonly existingImport: Import) {
    super("This file has already been imported.");
    this.name = "DuplicateImportError";
  }
}

export class ImportJobCancelledError extends Error {
  constructor() {
    super("Import job was cancelled.");
    this.name = "ImportJobCancelledError";
  }
}
