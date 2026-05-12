import { useCallback, useEffect, useRef, useState } from "react";

export function useLoginRequestLifecycle() {
  const [loading, setLoading] = useState(false);
  const mountedRef = useRef(true);
  const loginInFlightRef = useRef(false);
  const loginAbortControllerRef = useRef<AbortController | null>(null);
  const loginRequestIdRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      loginAbortControllerRef.current?.abort();
      loginAbortControllerRef.current = null;
      loginInFlightRef.current = false;
    };
  }, []);

  const isRequestInFlight = useCallback(() => loginInFlightRef.current, []);

  const shouldIgnoreRequest = useCallback((
    requestId: number,
    controller?: AbortController | null,
  ) =>
    !mountedRef.current
    || loginRequestIdRef.current !== requestId
    || Boolean(controller?.signal.aborted),
  []);

  const beginRequest = useCallback(() => {
    loginInFlightRef.current = true;
    const requestId = loginRequestIdRef.current + 1;
    loginRequestIdRef.current = requestId;
    setLoading(true);
    return requestId;
  }, []);

  const setActiveController = useCallback((controller: AbortController) => {
    loginAbortControllerRef.current = controller;
  }, []);

  const finalizeRequest = useCallback((requestId: number, controller: AbortController | null) => {
    if (loginAbortControllerRef.current === controller) {
      loginAbortControllerRef.current = null;
    }
    if (loginRequestIdRef.current === requestId) {
      loginInFlightRef.current = false;
    }
    if (mountedRef.current && loginRequestIdRef.current === requestId) {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    beginRequest,
    finalizeRequest,
    isRequestInFlight,
    setActiveController,
    shouldIgnoreRequest,
  };
}
