import { startTransition } from "react";
import type {
  AllAnalysisResult,
  AnalysisData,
  AnalysisMode,
  SingleAnalysisResult,
} from "@/pages/analysis/types";
import { getPaginatedItems } from "@/pages/analysis/utils";

type ResolveAnalysisDatasetOptions = {
  mode: AnalysisMode;
  singleResult: SingleAnalysisResult | null;
  allResult: AllAnalysisResult | null;
};

export function isAnalysisAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function resolveAnalysisDataset({
  mode,
  singleResult,
  allResult,
}: ResolveAnalysisDatasetOptions) {
  if (mode === "single" && singleResult) {
    return {
      analysis: singleResult.analysis,
      totalRows: singleResult.totalRows,
    };
  }

  if (mode === "all" && allResult) {
    return {
      analysis: allResult.analysis,
      totalRows: allResult.totalRows,
    };
  }

  return {
    analysis: null as AnalysisData | null,
    totalRows: 0,
  };
}

export function getAnalysisSpecialIdPagedSections(
  analysis: AnalysisData | null,
  tablePages: Record<string, number>,
) {
  return {
    polis: getPaginatedItems("polis", analysis?.noPolis.samples || [], tablePages),
    tentera: getPaginatedItems("tentera", analysis?.noTentera.samples || [], tablePages),
    passportMY: getPaginatedItems("passportMY", analysis?.passportMY.samples || [], tablePages),
    passportLN: getPaginatedItems(
      "passportLN",
      analysis?.passportLuarNegara.samples || [],
      tablePages,
    ),
  };
}

type DeferredSectionResolveOptions = {
  enabled: boolean;
  rootMargin: string;
  timeoutMs: number;
  shouldRender: boolean;
  triggerNode: HTMLDivElement | null;
  setShouldRender: (value: boolean | ((value: boolean) => boolean)) => void;
};

export function resolveDeferredAnalysisSectionMount({
  enabled,
  rootMargin,
  timeoutMs,
  shouldRender,
  triggerNode,
  setShouldRender,
}: DeferredSectionResolveOptions) {
  if (!enabled) {
    setShouldRender(true);
    return () => {};
  }

  if (shouldRender) {
    return () => {};
  }

  let cancelled = false;
  let observer: IntersectionObserver | null = null;
  let timeoutHandle: number | null = null;

  const markReady = () => {
    if (cancelled) {
      return;
    }

    startTransition(() => {
      setShouldRender(true);
    });
  };

  if (typeof window.IntersectionObserver === "function" && triggerNode) {
    observer = new window.IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) {
          return;
        }

        observer?.disconnect();
        observer = null;
        markReady();
      },
      {
        rootMargin,
      },
    );
    observer.observe(triggerNode);
  } else {
    timeoutHandle = window.setTimeout(markReady, timeoutMs);
  }

  return () => {
    cancelled = true;
    observer?.disconnect();
    observer = null;
    if (timeoutHandle !== null) {
      window.clearTimeout(timeoutHandle);
    }
  };
}
