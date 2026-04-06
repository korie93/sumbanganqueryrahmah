import { useCallback, useEffect, useRef, useState } from "react";
import type { SearchResultRow } from "@/pages/general-search/types";
import { resolveGeneralSearchExportBlockReason } from "@/pages/general-search/export-guards";
import { downloadSearchResultsAsCsv } from "@/pages/general-search/utils";

interface UseGeneralSearchExportStateParams {
  activeFiltersCount: number;
  advancedMode: boolean;
  headers: string[];
  onError: (message: string) => void;
  query: string;
  results: SearchResultRow[];
}

export function useGeneralSearchExportState({
  activeFiltersCount,
  advancedMode,
  headers,
  onError,
  query,
  results,
}: UseGeneralSearchExportStateParams) {
  const isMountedRef = useRef(true);
  const exportInFlightRef = useRef(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      exportInFlightRef.current = false;
    };
  }, []);

  const exportToCSV = useCallback(() => {
    if (results.length === 0) return;
    const exportName = `SQR-search-results-${
      advancedMode ? "advanced" : query
    }-${new Date().toISOString().split("T")[0]}.csv`;
    downloadSearchResultsAsCsv(headers, results, exportName);
  }, [advancedMode, headers, query, results]);

  const exportToPDF = useCallback(async () => {
    const blockReason = resolveGeneralSearchExportBlockReason({
      resultsLength: results.length,
      exportingPdf,
    });
    if (blockReason === "busy" || exportInFlightRef.current) return;
    if (blockReason === "no_data") return;

    exportInFlightRef.current = true;
    setExportingPdf(true);
    try {
      const { exportSearchResultsToPdf } = await import(
        "@/pages/general-search/export"
      );
      await exportSearchResultsToPdf({
        advancedMode,
        activeFiltersCount,
        headers,
        query,
        results,
      });
    } catch (exportError) {
      onError(
        `Failed to export PDF: ${
          exportError instanceof Error ? exportError.message : "Unknown error"
        }`,
      );
    } finally {
      exportInFlightRef.current = false;
      if (!isMountedRef.current) return;
      setExportingPdf(false);
    }
  }, [
    activeFiltersCount,
    advancedMode,
    exportingPdf,
    headers,
    onError,
    query,
    results,
  ]);

  return {
    state: {
      exportingPdf,
    },
    actions: {
      exportToCSV,
      exportToPDF: () => void exportToPDF(),
    },
  };
}
