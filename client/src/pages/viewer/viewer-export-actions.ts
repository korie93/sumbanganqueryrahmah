import type { DataRowWithId } from "@/pages/viewer/types";
import { toast } from "@/hooks/use-toast";
import { logClientError } from "@/lib/client-logger";
import { createRetryableModuleLoader } from "@/lib/retryable-module-loader";
import { resolveViewerExportBlockReason } from "@/pages/viewer/export-guards";
import { isAbortError } from "@/pages/viewer/page-utils";

const loadViewerExportModule = createRetryableModuleLoader<typeof import("@/pages/viewer/export")>(
  () => import("@/pages/viewer/export"),
);

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

    logClientError(`Failed to export ${kind}:`, exportError);
    toast({
      title: `${kind} Export Failed`,
      description: exportError instanceof Error ? exportError.message : "Unknown error",
      variant: "destructive",
    });
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
    performExport: async (rowsToExport) => {
      const { exportViewerRowsToCsv } = await loadViewerExportModule();
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
    performExport: async (rowsToExport) => {
      const { exportViewerRowsToPdf } = await loadViewerExportModule();
      return exportViewerRowsToPdf({
        headers,
        rows: rowsToExport,
        importName,
        exportFiltered,
        exportSelected,
      });
    },
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
    performExport: async (rowsToExport) => {
      const { exportViewerRowsToExcel } = await loadViewerExportModule();
      return exportViewerRowsToExcel({
        headers,
        rows: rowsToExport,
        importName,
        exportFiltered,
        exportSelected,
      });
    },
  });
}
