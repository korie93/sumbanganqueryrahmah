import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";

type UseAIPageRuntimeRefsOptions = {
  setIsTyping: Dispatch<SetStateAction<boolean>>;
};

export function useAIPageRuntimeRefs({
  setIsTyping,
}: UseAIPageRuntimeRefsOptions) {
  const pendingSendRef = useRef(false);
  const processingRef = useRef(false);
  const requestControllerRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(0);
  const typingTimerRef = useRef<number | null>(null);
  const slowNoticeTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const retryTimersRef = useRef<number[]>([]);

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

  const stopTyping = useCallback(() => {
    if (typingTimerRef.current !== null) {
      window.clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }
    if (isMountedRef.current) {
      setIsTyping(false);
    }
  }, [setIsTyping]);

  const abortActiveRequest = useCallback(() => {
    if (requestControllerRef.current) {
      requestControllerRef.current.abort();
      requestControllerRef.current = null;
    }
  }, []);

  return {
    abortActiveRequest,
    clearRetryTimers,
    clearSlowNoticeTimer,
    isMountedRef,
    pendingSendRef,
    processingRef,
    requestControllerRef,
    retryTimersRef,
    sessionRef,
    slowNoticeTimerRef,
    stopTyping,
    typingTimerRef,
  };
}

export type AIPageRuntimeRefs = ReturnType<typeof useAIPageRuntimeRefs>;
