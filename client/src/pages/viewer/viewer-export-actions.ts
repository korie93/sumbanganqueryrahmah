import type { DataRowWithId } from "@/pages/viewer/types";
import { toast } from "@/hooks/use-toast";
import { logClientError } from "@/lib/client-logger";
import { resolveViewerExportBlockReason } from "@/pages/viewer/export-guards";
import { isAbortError } from "@/pages/viewer/page-utils";

let viewerExportModulePromise: Promise<typeof import("@/pages/viewer/export")> | null = null;

function loadViewerExportModule() {
  if (!viewerExportModulePromise) {
    viewerExportModulePromise = import("@/pages/viewer/export");
  }

  return viewerExportModulePromise;
}

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
  beforeRun?: () => void | boolean;
  afterRun?: () => void;
  shouldContinue?: () => boolean;
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
  shouldContinue?: () => boolean;
};

type RunViewerManagedExportOptions = RunViewerNamedExportOptions & {
  beforeRun: () => void | boolean;
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
  shouldContinue = () => true,
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

  if (beforeRun?.() === false) return;

  try {
    const dataToExport = await loadRows(exportFiltered, exportSelected);
    if (!shouldContinue() || dataToExport.length === 0) return;

    await performExport(dataToExport);
  } catch (exportError) {
    if (!shouldContinue() || isAbortError(exportError)) {
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
  beforeRun,
  afterRun,
  shouldContinue = () => true,
}: RunViewerManagedExportOptions) {
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
    beforeRun,
    afterRun,
    shouldContinue,
    loadRows,
    performExport: async (rowsToExport) => {
      const { exportViewerRowsToCsv } = await loadViewerExportModule();
      if (!shouldContinue()) return;
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
  shouldContinue = () => true,
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
    shouldContinue,
    loadRows,
    performExport: async (rowsToExport) => {
      const { exportViewerRowsToPdf } = await loadViewerExportModule();
      if (!shouldContinue()) return;
      return exportViewerRowsToPdf({
        headers,
        rows: rowsToExport,
        importName,
        exportFiltered,
        exportSelected,
        shouldContinue,
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
  shouldContinue = () => true,
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
    shouldContinue,
    loadRows,
    performExport: async (rowsToExport) => {
      const { exportViewerRowsToExcel } = await loadViewerExportModule();
      if (!shouldContinue()) return;
      return exportViewerRowsToExcel({
        headers,
        rows: rowsToExport,
        importName,
        exportFiltered,
        exportSelected,
        shouldContinue,
      });
    },
  });
}
