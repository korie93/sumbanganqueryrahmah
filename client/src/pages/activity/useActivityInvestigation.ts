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
  const [relatedPagination, setRelatedPagination] = useState({
    activityId,
    page: 1,
    pageSize: 5,
  });
  const relatedPage = relatedPagination.activityId === activityId
    ? relatedPagination.page
    : 1;
  const relatedPageSize = relatedPagination.activityId === activityId
    ? relatedPagination.pageSize
    : 5;

  const retry = useCallback(() => {
    setRequestVersion((version) => version + 1);
  }, []);

  const setRelatedPage = useCallback((page: number) => {
    setRelatedPagination((current) => ({
      activityId,
      page: Math.max(1, Math.trunc(page)),
      pageSize: current.activityId === activityId ? current.pageSize : 5,
    }));
  }, [activityId]);

  const setRelatedPageSize = useCallback((pageSize: number) => {
    setRelatedPagination({
      activityId,
      page: 1,
      pageSize: Math.min(20, Math.max(1, Math.trunc(pageSize))),
    });
  }, [activityId]);

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
    setData((current) => (
      current?.session.id === activityId ? current : null
    ));
    setError(null);
    setLoading(true);

    void getActivityInvestigation(activityId, {
      relatedPage,
      relatedPageSize,
      signal: controller.signal,
    })
      .then((investigation) => {
        if (!controller.signal.aborted) {
          setData(investigation);
          if (investigation.relatedSessionsPagination.page !== relatedPage) {
            setRelatedPagination({
              activityId,
              page: investigation.relatedSessionsPagination.page,
              pageSize: investigation.relatedSessionsPagination.pageSize,
            });
          }
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
  }, [activityId, open, relatedPage, relatedPageSize, requestVersion]);

  return {
    data,
    error,
    loading,
    retry,
    setRelatedPage,
    setRelatedPageSize,
  };
}
