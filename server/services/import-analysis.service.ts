import type { ImportsRepository, ImportWithRowCount } from "../repositories/imports.repository";
import {
  consumeImportAnalysisRows,
  createImportAnalysisAccumulator,
  finalizeImportAnalysisAccumulator,
  IMPORT_ANALYSIS_BATCH_SIZE,
} from "./import-analysis-utils";

export class ImportAnalysisService {
  constructor(private readonly importsRepository: ImportsRepository) {}

  private throwIfAborted(signal?: AbortSignal) {
    if (!signal?.aborted) {
      return;
    }

    const error = new Error("Import analysis was aborted.");
    error.name = "AbortError";
    throw error;
  }

  async analyzeImport(
    importRecord: { id: string; name: string; filename: string },
    signal?: AbortSignal,
  ) {
    const accumulator = createImportAnalysisAccumulator();
    const totalRows = await this.importsRepository.getDataRowCountByImport(importRecord.id);
    let afterRowId: string | null = null;
    let processedRows = 0;

    while (processedRows < totalRows) {
      this.throwIfAborted(signal);
      const rows = await this.importsRepository.getDataRowsByImportPageAfterId(
        importRecord.id,
        IMPORT_ANALYSIS_BATCH_SIZE,
        afterRowId,
      );
      if (rows.length === 0) {
        break;
      }

      consumeImportAnalysisRows(accumulator, rows);
      processedRows += rows.length;
      afterRowId = rows[rows.length - 1]?.id ?? afterRowId;
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

  async analyzeAll(importsWithCounts: ImportWithRowCount[], signal?: AbortSignal) {
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

    for (const importRecord of importsWithCounts) {
      totalRows += Number(importRecord.rowCount || 0);
      let afterRowId: string | null = null;
      let processedRows = 0;

      while (processedRows < Number(importRecord.rowCount || 0)) {
        this.throwIfAborted(signal);
        const rows = await this.importsRepository.getDataRowsByImportPageAfterId(
          importRecord.id,
          IMPORT_ANALYSIS_BATCH_SIZE,
          afterRowId,
        );
        if (rows.length === 0) {
          break;
        }

        consumeImportAnalysisRows(accumulator, rows);
        processedRows += rows.length;
        afterRowId = rows[rows.length - 1]?.id ?? afterRowId;
      }
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
