import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

type UseAIChatRuntimeRefsOptions = {
  setIsTyping: Dispatch<SetStateAction<boolean>>;
};

type RuntimeMutableRef<T> = {
  current: T;
};

type CleanupAIChatRuntimeRefsParams = {
  requestControllerRef: RuntimeMutableRef<AbortController | null>;
  requestTimeoutRef: RuntimeMutableRef<number | null>;
  typingIntervalRef: RuntimeMutableRef<number | null>;
  retryTimersRef: RuntimeMutableRef<Set<number>>;
  slowNoticeTimerRef: RuntimeMutableRef<number | null>;
  processingRef: RuntimeMutableRef<boolean>;
  isMountedRef: RuntimeMutableRef<boolean>;
};

export function cleanupAIChatRuntimeRefs({
  requestControllerRef,
  requestTimeoutRef,
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

  if (requestTimeoutRef.current !== null) {
    globalThis.clearTimeout(requestTimeoutRef.current);
    requestTimeoutRef.current = null;
  }

  if (typingIntervalRef.current !== null) {
    globalThis.clearInterval(typingIntervalRef.current);
    typingIntervalRef.current = null;
  }

  retryTimersRef.current.forEach((timerId) => globalThis.clearTimeout(timerId));
  retryTimersRef.current.clear();

  if (slowNoticeTimerRef.current !== null) {
    globalThis.clearTimeout(slowNoticeTimerRef.current);
    slowNoticeTimerRef.current = null;
  }
}

export function useAIChatRuntimeRefs({
  setIsTyping,
}: UseAIChatRuntimeRefsOptions) {
  const requestControllerRef = useRef<AbortController | null>(null);
  const requestTimeoutRef = useRef<number | null>(null);
  const typingIntervalRef = useRef<number | null>(null);
  const retryTimersRef = useRef<Set<number>>(new Set());
  const slowNoticeTimerRef = useRef<number | null>(null);
  const sessionRef = useRef(0);
  const processingRef = useRef(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      cleanupAIChatRuntimeRefs({
        requestControllerRef,
        requestTimeoutRef,
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
    retryTimersRef.current.clear();
  }, []);

  const clearRequestTimeout = useCallback(() => {
    if (requestTimeoutRef.current !== null) {
      globalThis.clearTimeout(requestTimeoutRef.current);
      requestTimeoutRef.current = null;
    }
  }, []);

  const clearSlowNoticeTimer = useCallback(() => {
    if (slowNoticeTimerRef.current !== null) {
      globalThis.clearTimeout(slowNoticeTimerRef.current);
      slowNoticeTimerRef.current = null;
    }
  }, []);

  const registerRetryTimer = useCallback((timerId: number) => {
    retryTimersRef.current.add(timerId);
  }, []);

  const unregisterRetryTimer = useCallback((timerId: number) => {
    retryTimersRef.current.delete(timerId);
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
    clearRequestTimeout,
    clearSlowNoticeTimer,
    isMountedRef,
    processingRef,
    registerRetryTimer,
    requestControllerRef,
    requestTimeoutRef,
    sessionRef,
    slowNoticeTimerRef,
    stopTyping,
    typingIntervalRef,
    unregisterRetryTimer,
  };
}
