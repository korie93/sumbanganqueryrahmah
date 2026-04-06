import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeAll, analyzeImport } from "@/lib/api";
import type {
  AllAnalysisResult,
  AnalysisMode,
  AnalysisProps,
  SingleAnalysisResult,
} from "@/pages/analysis/types";
import {
  isAnalysisAbortError,
  resolveAnalysisDataset,
} from "@/pages/analysis/analysis-page-state-utils";

export function useAnalysisDataState({ onNavigate }: AnalysisProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<AnalysisMode>("single");
  const [singleResult, setSingleResult] = useState<SingleAnalysisResult | null>(null);
  const [allResult, setAllResult] = useState<AllAnalysisResult | null>(null);
  const [importName, setImportName] = useState("");

  const analysisAbortControllerRef = useRef<AbortController | null>(null);
  const analysisRequestIdRef = useRef(0);

  const fetchAllAnalysis = useCallback(async () => {
    analysisAbortControllerRef.current?.abort();
    const controller = new AbortController();
    analysisAbortControllerRef.current = controller;
    const requestId = ++analysisRequestIdRef.current;
    setLoading(true);
    setError("");
    setMode("all");

    try {
      const data = await analyzeAll({ signal: controller.signal });
      if (requestId !== analysisRequestIdRef.current) {
        return;
      }
      if (data.totalImports === 0) {
        setError("No saved files to analyze. Please import a file first.");
      } else {
        setAllResult(data);
      }
    } catch (fetchError: unknown) {
      if (isAnalysisAbortError(fetchError) || requestId !== analysisRequestIdRef.current) {
        return;
      }
      setError(fetchError instanceof Error ? fetchError.message : "Failed to analyze data.");
    } finally {
      if (requestId === analysisRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const fetchSingleAnalysis = useCallback(async () => {
    const importId = localStorage.getItem("analysisImportId");
    const name = localStorage.getItem("analysisImportName") || "Data";
    setImportName(name);

    if (!importId) {
      await fetchAllAnalysis();
      return;
    }

    analysisAbortControllerRef.current?.abort();
    const controller = new AbortController();
    analysisAbortControllerRef.current = controller;
    const requestId = ++analysisRequestIdRef.current;
    setLoading(true);
    setError("");
    setMode("single");

    try {
      const data = await analyzeImport(importId, { signal: controller.signal });
      if (requestId !== analysisRequestIdRef.current) {
        return;
      }
      setSingleResult(data);
    } catch (fetchError: unknown) {
      if (isAnalysisAbortError(fetchError) || requestId !== analysisRequestIdRef.current) {
        return;
      }
      setError(fetchError instanceof Error ? fetchError.message : "Failed to analyze data.");
    } finally {
      if (requestId === analysisRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, [fetchAllAnalysis]);

  useEffect(() => {
    void fetchSingleAnalysis();
  }, [fetchSingleAnalysis]);

  useEffect(() => {
    return () => {
      analysisAbortControllerRef.current?.abort();
    };
  }, []);

  const handleReset = useCallback(() => {
    localStorage.removeItem("analysisImportId");
    localStorage.removeItem("analysisImportName");
    void fetchAllAnalysis();
  }, [fetchAllAnalysis]);

  const handleRefresh = useCallback(() => {
    void (mode === "single" ? fetchSingleAnalysis() : fetchAllAnalysis());
  }, [fetchAllAnalysis, fetchSingleAnalysis, mode]);

  const { analysis, totalRows } = useMemo(
    () =>
      resolveAnalysisDataset({
        mode,
        singleResult,
        allResult,
      }),
    [allResult, mode, singleResult],
  );

  const handleBackToSaved = useCallback(() => {
    onNavigate("saved");
  }, [onNavigate]);

  return {
    loading,
    error,
    mode,
    singleResult,
    allResult,
    importName,
    analysis,
    totalRows,
    handleReset,
    handleRefresh,
    handleBackToSaved,
  };
}
