import {
  parseCreateImportBody,
  parseRenameBody,
} from "./imports-service-parsers";
import { ImportsServiceMutationOperations } from "./imports-service-mutation-operations";
import { ImportsServiceReadOperations } from "./imports-service-read-operations";
import type {
  CreateImportInput,
  ImportDataColumnFilter,
  ImportDataPageInput,
  ImportsServiceAnalysis,
  ImportsServiceRepository,
  ImportsServiceStorage,
  ListImportsInput,
  SearchImportRowsInput,
} from "./imports-service-types";
export type { ImportDataColumnFilter } from "./imports-service-types";

export class ImportsService {
  private readonly mutationOperations: ImportsServiceMutationOperations;
  private readonly readOperations: ImportsServiceReadOperations;

  constructor(
    storage: ImportsServiceStorage,
    importsRepository: ImportsServiceRepository,
    importAnalysisService: ImportsServiceAnalysis,
  ) {
    this.mutationOperations = new ImportsServiceMutationOperations(storage);
    this.readOperations = new ImportsServiceReadOperations(
      storage,
      importsRepository,
      importAnalysisService,
    );
  }

  async searchImportRows(params: SearchImportRowsInput) {
    return this.readOperations.searchImportRows(params);
  }

  async listImports(params: ListImportsInput = {}) {
    return this.readOperations.listImports(params);
  }

  async createImport(params: CreateImportInput) {
    return this.mutationOperations.createImport(params);
  }

  async getImportDetails(importId: string) {
    return this.readOperations.getImportDetails(importId);
  }

  async getImportDataPage(params: ImportDataPageInput) {
    return this.readOperations.getImportDataPage(params);
  }

  async analyzeImport(importId: string) {
    return this.readOperations.analyzeImport(importId);
  }

  async analyzeAll() {
    return this.readOperations.analyzeAll();
  }

  async renameImport(importId: string, name: string, updatedBy?: string) {
    return this.mutationOperations.renameImport(importId, name, updatedBy);
  }

  async deleteImport(importId: string, deletedBy?: string) {
    return this.mutationOperations.deleteImport(importId, deletedBy);
  }

  parseCreateImportBody(bodyRaw: unknown) {
    return parseCreateImportBody(bodyRaw);
  }

  parseRenameBody(bodyRaw: unknown) {
    return parseRenameBody(bodyRaw);
  }
}
