import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeAll, analyzeImport } from "@/lib/api";
import {
  getBrowserLocalStorage,
  getBrowserSessionStorage,
  safeGetStorageItem,
  safeRemoveStorageItem,
} from "@/lib/browser-storage";
import { storeViewerAnalysisSelection } from "@/pages/viewer/analysis-handoff";
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

  const isActiveAnalysisRequest = useCallback((
    controller: AbortController,
    requestId: number,
  ) => (
    !controller.signal.aborted
    && analysisAbortControllerRef.current === controller
    && requestId === analysisRequestIdRef.current
  ), []);

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
      if (!isActiveAnalysisRequest(controller, requestId)) {
        return;
      }
      if (data.totalImports === 0) {
        setError("No saved files to analyze. Please import a file first.");
      } else {
        setAllResult(data);
      }
    } catch (fetchError: unknown) {
      if (isAnalysisAbortError(fetchError) || !isActiveAnalysisRequest(controller, requestId)) {
        return;
      }
      setError(fetchError instanceof Error ? fetchError.message : "Failed to analyze data.");
    } finally {
      if (isActiveAnalysisRequest(controller, requestId)) {
        setLoading(false);
      }
      if (analysisAbortControllerRef.current === controller) {
        analysisAbortControllerRef.current = null;
      }
    }
  }, [isActiveAnalysisRequest]);

  const fetchSingleAnalysis = useCallback(async () => {
    const storage = getBrowserLocalStorage();
    const importId = safeGetStorageItem(storage, "analysisImportId");
    const name = safeGetStorageItem(storage, "analysisImportName") || "Data";
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
      if (!isActiveAnalysisRequest(controller, requestId)) {
        return;
      }
      setSingleResult(data);
    } catch (fetchError: unknown) {
      if (isAnalysisAbortError(fetchError) || !isActiveAnalysisRequest(controller, requestId)) {
        return;
      }
      setError(fetchError instanceof Error ? fetchError.message : "Failed to analyze data.");
    } finally {
      if (isActiveAnalysisRequest(controller, requestId)) {
        setLoading(false);
      }
      if (analysisAbortControllerRef.current === controller) {
        analysisAbortControllerRef.current = null;
      }
    }
  }, [fetchAllAnalysis, isActiveAnalysisRequest]);

  useEffect(() => {
    void fetchSingleAnalysis();
  }, [fetchSingleAnalysis]);

  useEffect(() => {
    return () => {
      analysisAbortControllerRef.current?.abort();
      analysisRequestIdRef.current += 1;
    };
  }, []);

  const handleReset = useCallback(() => {
    const storage = getBrowserLocalStorage();
    safeRemoveStorageItem(storage, "analysisImportId");
    safeRemoveStorageItem(storage, "analysisImportName");
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

  const handleInspectInViewer = useCallback((handoff: {
    focusColumn?: string;
    search?: string;
  }) => {
    if (mode !== "single" || !singleResult) {
      return;
    }

    const stored = storeViewerAnalysisSelection(
      getBrowserLocalStorage(),
      getBrowserSessionStorage(),
      {
        importId: singleResult.import.id,
        importName: singleResult.import.name,
        ...handoff,
      },
    );
    if (!stored) {
      setError("Unable to open this analysis in Viewer. Please return to Saved and try again.");
      return;
    }

    onNavigate("viewer", singleResult.import.id);
  }, [mode, onNavigate, singleResult]);

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
    handleInspectInViewer,
  };
}
