import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { analyzeImport } from "@/lib/api";
import {
  buildAnalysisComparison,
  type AnalysisComparison,
} from "@/pages/analysis/analysis-comparison-utils";
import { isAnalysisAbortError } from "@/pages/analysis/analysis-page-state-utils";
import type { AllAnalysisResult } from "@/pages/analysis/types";

type AnalysisComparisonStateOptions = {
  allResult: AllAnalysisResult | null;
};

export function useAnalysisComparisonState({
  allResult,
}: AnalysisComparisonStateOptions) {
  const imports = useMemo(() => allResult?.imports ?? [], [allResult?.imports]);
  const [baselineId, setBaselineIdState] = useState("");
  const [currentId, setCurrentIdState] = useState("");
  const [comparison, setComparison] = useState<AnalysisComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const importIds = new Set(imports.map((item) => item.id));
    setBaselineIdState((previous) =>
      importIds.has(previous) ? previous : imports[1]?.id ?? "",
    );
    setCurrentIdState((previous) =>
      importIds.has(previous) ? previous : imports[0]?.id ?? "",
    );
  }, [imports]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const clearComparison = useCallback(() => {
    abortControllerRef.current?.abort();
    requestIdRef.current += 1;
    setComparison(null);
    setLoading(false);
    setError("");
  }, []);

  const setBaselineId = useCallback((value: string) => {
    clearComparison();
    setBaselineIdState(value);
  }, [clearComparison]);

  const setCurrentId = useCallback((value: string) => {
    clearComparison();
    setCurrentIdState(value);
  }, [clearComparison]);

  const runComparison = useCallback(async () => {
    if (!baselineId || !currentId) {
      setError("Select two saved files before comparing.");
      return;
    }
    if (baselineId === currentId) {
      setError("Baseline and comparison files must be different.");
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const requestId = ++requestIdRef.current;
    setLoading(true);
    setError("");

    try {
      const [baselineResult, currentResult] = await Promise.all([
        analyzeImport(baselineId, { signal: controller.signal }),
        analyzeImport(currentId, { signal: controller.signal }),
      ]);
      if (requestId !== requestIdRef.current) return;
      setComparison(buildAnalysisComparison(baselineResult, currentResult));
    } catch (comparisonError: unknown) {
      if (
        isAnalysisAbortError(comparisonError) ||
        requestId !== requestIdRef.current
      ) {
        return;
      }
      setError(
        comparisonError instanceof Error
          ? comparisonError.message
          : "Unable to compare the selected files.",
      );
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [baselineId, currentId]);

  return {
    imports,
    baselineId,
    currentId,
    comparison,
    loading,
    error,
    setBaselineId,
    setCurrentId,
    runComparison,
  };
}
