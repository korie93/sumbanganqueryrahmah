import { useCallback, useEffect, useRef, useState } from "react";
import { getImportData } from "@/lib/api";
import type { ColumnFilter, DataRowWithId } from "@/pages/viewer/types";
import type { ImportDataNumericSort } from "@shared/common/import-data-sort";
import {
  runViewerCsvExport,
  runViewerExcelExport,
  runViewerPdfExport,
} from "@/pages/viewer/viewer-export-actions";
import {
  loadViewerPagedExportRows,
  resolveViewerImmediateExportRows,
} from "@/pages/viewer/viewer-export-loader";
import {
  createViewerExportLifecycle,
  type ViewerExportKind,
  type ViewerExportOwner,
} from "@/pages/viewer/viewer-export-lifecycle";
import {
  formatViewerExportProgress,
  type ViewerExportProgress,
} from "@/pages/viewer/viewer-export-progress";

type UseViewerExportStateOptions = {
  canExport?: (() => boolean) | undefined;
  rowsPerPage: number;
  importId?: string | undefined;
  importName: string;
  rows: DataRowWithId[];
  filteredRows: DataRowWithId[];
  visibleHeaders: string[];
  selectedRowIds: Set<number>;
  totalRows: number;
  debouncedSearch: string;
  debouncedColumnFilters: ColumnFilter[];
  numericSort?: ImportDataNumericSort | null | undefined;
};

export function useViewerExportState({
  canExport,
  rowsPerPage,
  importId,
  importName,
  rows,
  filteredRows,
  visibleHeaders,
  selectedRowIds,
  totalRows,
  debouncedSearch,
  debouncedColumnFilters,
  numericSort,
}: UseViewerExportStateOptions) {
  const [exportProgress, setExportProgress] = useState<ViewerExportProgress | null>(null);
  const exportingKind = exportProgress?.kind ?? null;
  const [lifecycle] = useState(createViewerExportLifecycle);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      lifecycle.cancel();
    };
  }, [lifecycle]);

  const cancelActiveExport = useCallback(() => {
    lifecycle.cancel();
    if (mountedRef.current) setExportProgress(null);
  }, [lifecycle]);

  // A different dataset or query must not inherit the previous export's progress.
  useEffect(() => cancelActiveExport, [cancelActiveExport, importId, debouncedSearch, debouncedColumnFilters, numericSort]);

  const loadRowsForExport = useCallback(async (
    exportFiltered: boolean,
    exportSelected: boolean,
    signal: AbortSignal,
    onProgress: (receivedRows: number) => void,
  ) => {
    if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    const immediateRows = resolveViewerImmediateExportRows({
      rows,
      filteredRows,
      selectedRowIds,
      exportFiltered,
      exportSelected,
    });

    if (exportSelected || exportFiltered || !importId || totalRows <= rows.length) {
      return immediateRows;
    }

    return loadViewerPagedExportRows({
      pageSize: rowsPerPage,
      search: debouncedSearch,
      columnFilters: debouncedColumnFilters,
      numericSort,
      signal,
      onProgress,
      getPage: ({ page, cursor, signal: pageSignal, search, columnFilters, numericSort: pageSort }) =>
        getImportData(importId, page, rowsPerPage, search, {
          signal: pageSignal,
          cursor,
          columnFilters,
          numericSort: pageSort,
        }),
    });
  }, [
    debouncedColumnFilters,
    debouncedSearch,
    numericSort,
    filteredRows,
    importId,
    rows,
    rowsPerPage,
    selectedRowIds,
    totalRows,
  ]);

  const runExport = useCallback(async (
    kind: ViewerExportKind,
    exportFiltered = false,
    exportSelected = false,
  ) => {
    if (!mountedRef.current || (canExport && !canExport())) return;
    let owner: ViewerExportOwner | null = null;
    const shouldContinue = () => mountedRef.current && owner !== null && lifecycle.isCurrent(owner)
      && (!canExport || canExport());
    const needsPagedRows = !exportSelected && !exportFiltered && Boolean(importId) && totalRows > rows.length;
    const exportOptions = {
      headers: visibleHeaders,
      importName,
      exportFiltered,
      exportSelected,
      totalRows,
      filteredRowsLength: filteredRows.length,
      selectedRowsLength: selectedRowIds.size,
      exportingExcel: exportingKind === "excel",
      exportingPdf: exportingKind === "pdf",
      isAnotherExportInFlight: lifecycle.isBusy(),
      beforeRun: () => {
        if (canExport && !canExport()) return false;
        owner = lifecycle.start(kind);
        if (!owner) return false;
        setExportProgress(needsPagedRows
          ? { kind, phase: "loading", receivedRows: 0, expectedRows: totalRows }
          : { kind, phase: "preparing" });
        return true;
      },
      afterRun: () => {
        if (owner && lifecycle.finish(owner) && mountedRef.current) setExportProgress(null);
      },
      shouldContinue,
      loadRows: async () => {
        if (!owner || !shouldContinue()) {
          return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
        }
        const exportRows = await loadRowsForExport(exportFiltered, exportSelected, owner.controller.signal, (receivedRows) => {
          if (shouldContinue()) setExportProgress({ kind, phase: "loading", receivedRows, expectedRows: totalRows });
        });
        if (shouldContinue() && exportRows.length > 0) setExportProgress({ kind, phase: "preparing" });
        return exportRows;
      },
    };
    const exportAction = kind === "csv" ? runViewerCsvExport
      : kind === "pdf" ? runViewerPdfExport : runViewerExcelExport;
    await exportAction(exportOptions);
  }, [
    canExport,
    exportingKind,
    filteredRows.length,
    importName,
    importId,
    lifecycle,
    loadRowsForExport,
    rows.length,
    selectedRowIds.size,
    totalRows,
    visibleHeaders,
  ]);

  const handleExportCsv = useCallback((exportFiltered = false, exportSelected = false) => {
    void runExport("csv", exportFiltered, exportSelected);
  }, [runExport]);
  const handleExportPdf = useCallback((exportFiltered = false, exportSelected = false) => {
    void runExport("pdf", exportFiltered, exportSelected);
  }, [runExport]);
  const handleExportExcel = useCallback((exportFiltered = false, exportSelected = false) => {
    void runExport("excel", exportFiltered, exportSelected);
  }, [runExport]);

  return {
    exportBusy: exportingKind !== null,
    exportStatus: exportProgress ? formatViewerExportProgress(exportProgress) : null,
    exportingExcel: exportingKind === "excel",
    exportingPdf: exportingKind === "pdf",
    cancelActiveExport,
    handleExportCsv,
    handleExportPdf,
    handleExportExcel,
  };
}
