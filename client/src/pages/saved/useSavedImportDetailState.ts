import { useEffect, useRef, useState } from "react";
import { getImportSummary } from "@/lib/api";
import { isSavedAbortError, readSavedErrorMessage } from "@/pages/saved/saved-state-utils";
import type { SavedImportSummary } from "@/pages/saved/types";

export function useSavedImportDetailState(importId: string | null) {
  const [summary, setSummary] = useState<SavedImportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const requestIdRef = useRef(0);

  useEffect(() => {
    const requestId = ++requestIdRef.current;
    setSummary(null);
    setError("");
    if (!importId) {
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    void getImportSummary(importId, { signal: controller.signal })
      .then((result) => {
        if (requestId === requestIdRef.current) {
          setSummary(result);
        }
      })
      .catch((fetchError: unknown) => {
        if (!isSavedAbortError(fetchError) && requestId === requestIdRef.current) {
          setError(readSavedErrorMessage(fetchError, "Unable to load file details."));
        }
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
      requestIdRef.current += 1;
    };
  }, [importId]);

  return { summary, loading, error };
}
