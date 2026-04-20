import type { ImportsRepository, ImportWithRowCount } from "../repositories/imports.repository";
import {
  consumeImportAnalysisRows,
  createImportAnalysisAccumulator,
  finalizeImportAnalysisAccumulator,
  IMPORT_ANALYSIS_BATCH_SIZE,
} from "./import-analysis-utils";

export class ImportAnalysisService {
  constructor(private readonly importsRepository: ImportsRepository) {}

  async analyzeImport(importRecord: { id: string; name: string; filename: string }) {
    const accumulator = createImportAnalysisAccumulator();
    const totalRows = await this.importsRepository.getDataRowCountByImport(importRecord.id);

    for (let offset = 0; offset < totalRows; offset += IMPORT_ANALYSIS_BATCH_SIZE) {
      const rows = await this.importsRepository.getDataRowsByImportPage(
        importRecord.id,
        IMPORT_ANALYSIS_BATCH_SIZE,
        offset,
      );
      consumeImportAnalysisRows(accumulator, rows);
    }

    return {
      import: {
        id: importRecord.id,
        name: importRecord.name,
        filename: importRecord.filename,
      },
      totalRows,
      analysis: finalizeImportAnalysisAccumulator(accumulator),
    };
  }

  async analyzeAll(importsWithCounts: ImportWithRowCount[]) {
    if (importsWithCounts.length === 0) {
      return {
        totalImports: 0,
        totalRows: 0,
        imports: [],
        analysis: finalizeImportAnalysisAccumulator(createImportAnalysisAccumulator()),
      };
    }

    const accumulator = createImportAnalysisAccumulator();
    let totalRows = 0;
    const importIds: string[] = [];

    for (const importRecord of importsWithCounts) {
      totalRows += Number(importRecord.rowCount || 0);
      importIds.push(importRecord.id);
    }

    for (let offset = 0; offset < totalRows; offset += IMPORT_ANALYSIS_BATCH_SIZE) {
      const rows = await this.importsRepository.getDataRowsByImportIdsPage(
        importIds,
        IMPORT_ANALYSIS_BATCH_SIZE,
        offset,
      );
      consumeImportAnalysisRows(accumulator, rows);
    }

    return {
      totalImports: importsWithCounts.length,
      totalRows,
      imports: importsWithCounts.map((importRecord) => ({
        id: importRecord.id,
        name: importRecord.name,
        filename: importRecord.filename,
        rowCount: importRecord.rowCount,
      })),
      analysis: finalizeImportAnalysisAccumulator(accumulator),
    };
  }
}
