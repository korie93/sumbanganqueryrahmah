import type { DataRowWithId } from "@/pages/viewer/types";
import { resolveViewerExportBlockReason } from "@/pages/viewer/export-guards";
import {
  exportViewerRowsToCsv,
  exportViewerRowsToExcel,
  exportViewerRowsToPdf,
} from "@/pages/viewer/export";
import { isAbortError } from "@/pages/viewer/page-utils";

type ExecuteViewerExportOptions = {
  kind: "CSV" | "PDF" | "Excel";
  exportFiltered?: boolean;
  exportSelected?: boolean;
  totalRows: number;
  filteredRowsLength: number;
  selectedRowsLength: number;
  exportingExcel: boolean;
  exportingPdf: boolean;
  isAnotherExportInFlight: boolean;
  loadRows: (exportFiltered?: boolean, exportSelected?: boolean) => Promise<DataRowWithId[]>;
  performExport: (rows: DataRowWithId[]) => Promise<void> | void;
  beforeRun?: () => void;
  afterRun?: () => void;
};

type RunViewerNamedExportOptions = {
  headers: string[];
  importName: string;
  totalRows: number;
  filteredRowsLength: number;
  selectedRowsLength: number;
  exportingExcel: boolean;
  exportingPdf: boolean;
  isAnotherExportInFlight: boolean;
  loadRows: (exportFiltered?: boolean, exportSelected?: boolean) => Promise<DataRowWithId[]>;
  exportFiltered?: boolean;
  exportSelected?: boolean;
};

type RunViewerManagedExportOptions = RunViewerNamedExportOptions & {
  beforeRun: () => void;
  afterRun: () => void;
};

export async function executeViewerExport({
  kind,
  exportFiltered = false,
  exportSelected = false,
  totalRows,
  filteredRowsLength,
  selectedRowsLength,
  exportingExcel,
  exportingPdf,
  isAnotherExportInFlight,
  loadRows,
  performExport,
  beforeRun,
  afterRun,
}: ExecuteViewerExportOptions) {
  const blockReason = resolveViewerExportBlockReason({
    totalRows,
    filteredRowsLength,
    selectedRowsLength,
    exportFiltered,
    exportSelected,
    exportingExcel,
    exportingPdf,
  });
  if (blockReason === "busy" || isAnotherExportInFlight) return;
  if (blockReason === "no_data") return;

  beforeRun?.();

  try {
    const dataToExport = await loadRows(exportFiltered, exportSelected);
    if (dataToExport.length === 0) return;

    await performExport(dataToExport);
  } catch (exportError) {
    if (isAbortError(exportError)) {
      return;
    }

    console.error(`Failed to export ${kind}:`, exportError);
    alert(
      `Failed to export ${kind}: ${
        exportError instanceof Error ? exportError.message : "Unknown error"
      }`,
    );
  } finally {
    afterRun?.();
  }
}

export async function runViewerCsvExport({
  headers,
  importName,
  totalRows,
  filteredRowsLength,
  selectedRowsLength,
  exportingExcel,
  exportingPdf,
  isAnotherExportInFlight,
  loadRows,
  exportFiltered = false,
  exportSelected = false,
}: RunViewerNamedExportOptions) {
  await executeViewerExport({
    kind: "CSV",
    exportFiltered,
    exportSelected,
    totalRows,
    filteredRowsLength,
    selectedRowsLength,
    exportingExcel,
    exportingPdf,
    isAnotherExportInFlight,
    loadRows,
    performExport: (rowsToExport) => {
      exportViewerRowsToCsv({
        headers,
        rows: rowsToExport,
        importName,
        exportFiltered,
        exportSelected,
      });
    },
  });
}

export async function runViewerPdfExport({
  headers,
  importName,
  totalRows,
  filteredRowsLength,
  selectedRowsLength,
  exportingExcel,
  exportingPdf,
  isAnotherExportInFlight,
  loadRows,
  beforeRun,
  afterRun,
  exportFiltered = false,
  exportSelected = false,
}: RunViewerManagedExportOptions) {
  await executeViewerExport({
    kind: "PDF",
    exportFiltered,
    exportSelected,
    totalRows,
    filteredRowsLength,
    selectedRowsLength,
    exportingExcel,
    exportingPdf,
    isAnotherExportInFlight,
    beforeRun,
    afterRun,
    loadRows,
    performExport: (rowsToExport) =>
      exportViewerRowsToPdf({
        headers,
        rows: rowsToExport,
        importName,
        exportFiltered,
        exportSelected,
      }),
  });
}

export async function runViewerExcelExport({
  headers,
  importName,
  totalRows,
  filteredRowsLength,
  selectedRowsLength,
  exportingExcel,
  exportingPdf,
  isAnotherExportInFlight,
  loadRows,
  beforeRun,
  afterRun,
  exportFiltered = false,
  exportSelected = false,
}: RunViewerManagedExportOptions) {
  await executeViewerExport({
    kind: "Excel",
    exportFiltered,
    exportSelected,
    totalRows,
    filteredRowsLength,
    selectedRowsLength,
    exportingExcel,
    exportingPdf,
    isAnotherExportInFlight,
    beforeRun,
    afterRun,
    loadRows,
    performExport: (rowsToExport) =>
      exportViewerRowsToExcel({
        headers,
        rows: rowsToExport,
        importName,
        exportFiltered,
        exportSelected,
      }),
  });
}
