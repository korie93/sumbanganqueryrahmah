import type { DataRowWithId } from "@/pages/viewer/types";
import { resolveViewerExportBlockReason } from "@/pages/viewer/export-guards";
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
