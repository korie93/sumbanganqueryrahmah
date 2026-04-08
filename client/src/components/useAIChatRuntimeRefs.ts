import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

type UseAIChatRuntimeRefsOptions = {
  setIsTyping: Dispatch<SetStateAction<boolean>>;
};

type RuntimeMutableRef<T> = {
  current: T;
};

type CleanupAIChatRuntimeRefsParams = {
  requestControllerRef: RuntimeMutableRef<AbortController | null>;
  typingIntervalRef: RuntimeMutableRef<number | null>;
  retryTimersRef: RuntimeMutableRef<number[]>;
  slowNoticeTimerRef: RuntimeMutableRef<number | null>;
  processingRef: RuntimeMutableRef<boolean>;
  isMountedRef: RuntimeMutableRef<boolean>;
};

export function cleanupAIChatRuntimeRefs({
  requestControllerRef,
  typingIntervalRef,
  retryTimersRef,
  slowNoticeTimerRef,
  processingRef,
  isMountedRef,
}: CleanupAIChatRuntimeRefsParams) {
  isMountedRef.current = false;
  processingRef.current = false;

  if (requestControllerRef.current) {
    requestControllerRef.current.abort();
    requestControllerRef.current = null;
  }

  if (typingIntervalRef.current !== null) {
    globalThis.clearInterval(typingIntervalRef.current);
    typingIntervalRef.current = null;
  }

  retryTimersRef.current.forEach((timerId) => globalThis.clearTimeout(timerId));
  retryTimersRef.current = [];

  if (slowNoticeTimerRef.current !== null) {
    globalThis.clearTimeout(slowNoticeTimerRef.current);
    slowNoticeTimerRef.current = null;
  }
}

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
      cleanupAIChatRuntimeRefs({
        requestControllerRef,
        typingIntervalRef,
        retryTimersRef,
        slowNoticeTimerRef,
        processingRef,
        isMountedRef,
      });
    };
  }, []);

  const abortActiveRequest = useCallback(() => {
    if (requestControllerRef.current) {
      requestControllerRef.current.abort();
      requestControllerRef.current = null;
    }
  }, []);

  const clearRetryTimers = useCallback(() => {
    retryTimersRef.current.forEach((timerId) => globalThis.clearTimeout(timerId));
    retryTimersRef.current = [];
  }, []);

  const clearSlowNoticeTimer = useCallback(() => {
    if (slowNoticeTimerRef.current !== null) {
      globalThis.clearTimeout(slowNoticeTimerRef.current);
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
      globalThis.clearInterval(typingIntervalRef.current);
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
