import { useEffect, useRef, useState } from "react";
import { resolveDeferredAnalysisSectionMount } from "@/pages/analysis/analysis-page-state-utils";

type DeferredAnalysisSectionOptions = {
  enabled: boolean;
  rootMargin?: string;
  timeoutMs?: number;
};

export function useDeferredAnalysisSectionMount({
  enabled,
  rootMargin = "320px 0px",
  timeoutMs = 1400,
}: DeferredAnalysisSectionOptions) {
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(() => !enabled);

  useEffect(() => {
    return resolveDeferredAnalysisSectionMount({
      enabled,
      rootMargin,
      timeoutMs,
      shouldRender,
      triggerNode: triggerRef.current,
      setShouldRender,
    });
  }, [enabled, rootMargin, shouldRender, timeoutMs]);

  return { shouldRender, triggerRef };
}
