import { useCallback, useEffect, useRef, useState } from "react";
import {
  getActivityInvestigation,
  type ActivityInvestigation,
} from "@/lib/api";
import { getApiErrorMessage } from "@/lib/api-errors";

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

export function useActivityInvestigation(activityId: string | null, open: boolean) {
  const controllerRef = useRef<AbortController | null>(null);
  const [data, setData] = useState<ActivityInvestigation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [requestVersion, setRequestVersion] = useState(0);

  const retry = useCallback(() => {
    setRequestVersion((version) => version + 1);
  }, []);

  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;

    if (!open || !activityId) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    setData(null);
    setError(null);
    setLoading(true);

    void getActivityInvestigation(activityId, { signal: controller.signal })
      .then((investigation) => {
        if (!controller.signal.aborted) {
          setData(investigation);
        }
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted && !isAbortError(loadError)) {
          setError(getApiErrorMessage(
            loadError,
            "Session investigation could not be loaded.",
          ));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      controller.abort();
      if (controllerRef.current === controller) {
        controllerRef.current = null;
      }
    };
  }, [activityId, open, requestVersion]);

  return {
    data,
    error,
    loading,
    retry,
  };
}
