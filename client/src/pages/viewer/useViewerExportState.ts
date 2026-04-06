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

type UseViewerExportStateOptions = {
  rowsPerPage: number;
  importId?: string;
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
  const [exportingExcel, setExportingExcel] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const exportInFlightRef = useRef<"excel" | "pdf" | null>(null);
  const exportAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      exportAbortControllerRef.current?.abort();
      exportAbortControllerRef.current = null;
    };
  }, []);

  const cancelActiveExport = useCallback(() => {
    exportAbortControllerRef.current?.abort();
    exportAbortControllerRef.current = null;
  }, []);

  const loadRowsForExport = useCallback(async (exportFiltered = false, exportSelected = false) => {
    const immediateRows = resolveViewerImmediateExportRows({
      rows,
      filteredRows,
      selectedRowIds,
      exportFiltered,
      exportSelected,
    });

    if (exportSelected || exportFiltered) {
      return immediateRows;
    }

    if (!importId || totalRows <= rows.length) {
      return immediateRows;
    }

    exportAbortControllerRef.current?.abort();
    const controller = new AbortController();
    exportAbortControllerRef.current = controller;

    try {
      return await loadViewerPagedExportRows({
        pageSize: rowsPerPage,
        search: debouncedSearch,
        columnFilters: debouncedColumnFilters,
        signal: controller.signal,
        getPage: ({ page, cursor, signal, search, columnFilters }) =>
          getImportData(importId, page, rowsPerPage, search, {
            signal,
            cursor,
            columnFilters,
          }),
      });
    } finally {
      if (exportAbortControllerRef.current === controller) {
        exportAbortControllerRef.current = null;
      }
    }
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

  const startPdfExport = useCallback(() => {
    exportInFlightRef.current = "pdf";
    setExportingPdf(true);
  }, []);

  const finishPdfExport = useCallback(() => {
    exportInFlightRef.current = null;
    setExportingPdf(false);
  }, []);

  const startExcelExport = useCallback(() => {
    exportInFlightRef.current = "excel";
    setExportingExcel(true);
  }, []);

  const finishExcelExport = useCallback(() => {
    exportInFlightRef.current = null;
    setExportingExcel(false);
  }, []);

  const exportToCSV = useCallback(async (exportFiltered = false, exportSelected = false) => {
    await runViewerCsvExport({
      headers: visibleHeaders,
      importName,
      exportFiltered,
      exportSelected,
      totalRows,
      filteredRowsLength: filteredRows.length,
      selectedRowsLength: selectedRowIds.size,
      exportingExcel,
      exportingPdf,
      isAnotherExportInFlight: exportInFlightRef.current !== null,
      loadRows: loadRowsForExport,
    });
  }, [
    exportingExcel,
    exportingPdf,
    filteredRows.length,
    importName,
    loadRowsForExport,
    selectedRowIds.size,
    totalRows,
    visibleHeaders,
  ]);

  const exportToPDF = useCallback(async (exportFiltered = false, exportSelected = false) => {
    await runViewerPdfExport({
      headers: visibleHeaders,
      importName,
      exportFiltered,
      exportSelected,
      totalRows,
      filteredRowsLength: filteredRows.length,
      selectedRowsLength: selectedRowIds.size,
      exportingExcel,
      exportingPdf,
      isAnotherExportInFlight: exportInFlightRef.current !== null,
      beforeRun: startPdfExport,
      afterRun: finishPdfExport,
      loadRows: loadRowsForExport,
    });
  }, [
    exportingExcel,
    exportingPdf,
    filteredRows.length,
    finishPdfExport,
    importName,
    loadRowsForExport,
    selectedRowIds.size,
    startPdfExport,
    totalRows,
    visibleHeaders,
  ]);

  const exportToExcel = useCallback(async (exportFiltered = false, exportSelected = false) => {
    await runViewerExcelExport({
      headers: visibleHeaders,
      importName,
      exportFiltered,
      exportSelected,
      totalRows,
      filteredRowsLength: filteredRows.length,
      selectedRowsLength: selectedRowIds.size,
      exportingExcel,
      exportingPdf,
      isAnotherExportInFlight: exportInFlightRef.current !== null,
      beforeRun: startExcelExport,
      afterRun: finishExcelExport,
      loadRows: loadRowsForExport,
    });
  }, [
    exportingExcel,
    exportingPdf,
    filteredRows.length,
    finishExcelExport,
    importName,
    loadRowsForExport,
    selectedRowIds.size,
    startExcelExport,
    totalRows,
    visibleHeaders,
  ]);

  const handleExportCsv = useCallback((exportFiltered = false, exportSelected = false) => {
    void exportToCSV(exportFiltered, exportSelected);
  }, [exportToCSV]);

  const handleExportPdf = useCallback((exportFiltered = false, exportSelected = false) => {
    void exportToPDF(exportFiltered, exportSelected);
  }, [exportToPDF]);

  const handleExportExcel = useCallback((exportFiltered = false, exportSelected = false) => {
    void exportToExcel(exportFiltered, exportSelected);
  }, [exportToExcel]);

  return {
    exportingExcel,
    exportingPdf,
    cancelActiveExport,
    handleExportCsv,
    handleExportPdf,
    handleExportExcel,
  };
}
