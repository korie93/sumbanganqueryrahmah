import { useCallback, useEffect, useRef, useState } from "react";
import { getImportData } from "@/lib/api";
import type { ColumnFilter, DataRowWithId } from "@/pages/viewer/types";
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

type UseViewerExportStateOptions = {
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
};

export function useViewerExportState({
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
}: UseViewerExportStateOptions) {
  const [exportingKind, setExportingKind] = useState<ViewerExportKind | null>(null);
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
    if (mountedRef.current) setExportingKind(null);
  }, [lifecycle]);

  // A new dataset must not inherit an export owned by the previous dataset.
  useEffect(() => cancelActiveExport, [cancelActiveExport, importId]);

  const loadRowsForExport = useCallback(async (
    exportFiltered: boolean,
    exportSelected: boolean,
    signal: AbortSignal,
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
      signal,
      getPage: ({ page, cursor, signal: pageSignal, search, columnFilters }) =>
        getImportData(importId, page, rowsPerPage, search, {
          signal: pageSignal,
          cursor,
          columnFilters,
        }),
    });
  }, [
    debouncedColumnFilters,
    debouncedSearch,
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
    if (!mountedRef.current) return;
    let owner: ViewerExportOwner | null = null;
    const shouldContinue = () => mountedRef.current && owner !== null && lifecycle.isCurrent(owner);
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
        owner = lifecycle.start(kind);
        if (!owner) return false;
        setExportingKind(kind);
        return true;
      },
      afterRun: () => {
        if (owner && lifecycle.finish(owner) && mountedRef.current) setExportingKind(null);
      },
      shouldContinue,
      loadRows: () => {
        if (!owner || !shouldContinue()) {
          return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
        }
        return loadRowsForExport(exportFiltered, exportSelected, owner.controller.signal);
      },
    };
    const exportAction = kind === "csv" ? runViewerCsvExport
      : kind === "pdf" ? runViewerPdfExport : runViewerExcelExport;
    await exportAction(exportOptions);
  }, [
    exportingKind,
    filteredRows.length,
    importName,
    lifecycle,
    loadRowsForExport,
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
    exportingExcel: exportingKind === "excel",
    exportingPdf: exportingKind === "pdf",
    cancelActiveExport,
    handleExportCsv,
    handleExportPdf,
    handleExportExcel,
  };
}
