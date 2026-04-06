import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

type UseAIChatRuntimeRefsOptions = {
  setIsTyping: Dispatch<SetStateAction<boolean>>;
};

export function useAIChatRuntimeRefs({
  setIsTyping,
}: UseAIChatRuntimeRefsOptions) {
  const requestControllerRef = useRef<AbortController | null>(null);
  const typingIntervalRef = useRef<number | null>(null);
  const retryTimersRef = useRef<number[]>([]);
  const slowNoticeTimerRef = useRef<number | null>(null);
  const sessionRef = useRef(0);
  const processingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, [isMountedRef]);

  const abortActiveRequest = useCallback(() => {
    if (requestControllerRef.current) {
      requestControllerRef.current.abort();
      requestControllerRef.current = null;
    }
  }, []);

  const clearRetryTimers = useCallback(() => {
    retryTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    retryTimersRef.current = [];
  }, []);

  const clearSlowNoticeTimer = useCallback(() => {
    if (slowNoticeTimerRef.current !== null) {
      window.clearTimeout(slowNoticeTimerRef.current);
      slowNoticeTimerRef.current = null;
    }
  }, []);

  const registerRetryTimer = useCallback((timerId: number) => {
    retryTimersRef.current.push(timerId);
  }, []);

  const unregisterRetryTimer = useCallback((timerId: number) => {
    retryTimersRef.current = retryTimersRef.current.filter((existingId) => existingId !== timerId);
  }, []);

  const stopTyping = useCallback(() => {
    if (typingIntervalRef.current !== null) {
      window.clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
    if (isMountedRef.current) {
      setIsTyping(false);
    }
  }, [isMountedRef, setIsTyping]);

  return {
    abortActiveRequest,
    clearRetryTimers,
    clearSlowNoticeTimer,
    isMountedRef,
    processingRef,
    registerRetryTimer,
    requestControllerRef,
    sessionRef,
    slowNoticeTimerRef,
    stopTyping,
    typingIntervalRef,
    unregisterRetryTimer,
  };
}
