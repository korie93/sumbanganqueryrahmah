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
  trackedTimeoutsRef: RuntimeMutableRef<Set<number>>;
  slowNoticeTimerRef: RuntimeMutableRef<number | null>;
  processingRef: RuntimeMutableRef<boolean>;
  isMountedRef: RuntimeMutableRef<boolean>;
};

export function scheduleTrackedAIChatTimeout(
  trackedTimeouts: Set<number>,
  callback: () => void,
  delayMs: number,
) {
  let timeoutId = 0;
  timeoutId = window.setTimeout(() => {
    trackedTimeouts.delete(timeoutId);
    callback();
  }, delayMs);
  trackedTimeouts.add(timeoutId);
  return timeoutId;
}

export function clearTrackedAIChatTimeout(
  trackedTimeouts: Set<number>,
  timeoutId: number | null,
) {
  if (timeoutId === null) {
    return;
  }

  trackedTimeouts.delete(timeoutId);
  globalThis.clearTimeout(timeoutId);
}

export function clearTrackedAIChatTimeouts(trackedTimeouts: Set<number>) {
  trackedTimeouts.forEach((timeoutId) => {
    globalThis.clearTimeout(timeoutId);
  });
  trackedTimeouts.clear();
}

export function cleanupAIChatRuntimeRefs({
  requestControllerRef,
  typingIntervalRef,
  trackedTimeoutsRef,
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

  clearTrackedAIChatTimeouts(trackedTimeoutsRef.current);
  slowNoticeTimerRef.current = null;
}

export function useAIChatRuntimeRefs({
  setIsTyping,
}: UseAIChatRuntimeRefsOptions) {
  const requestControllerRef = useRef<AbortController | null>(null);
  const typingIntervalRef = useRef<number | null>(null);
  const trackedTimeoutsRef = useRef<Set<number>>(new Set());
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
        trackedTimeoutsRef,
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
    clearTrackedAIChatTimeouts(trackedTimeoutsRef.current);
    slowNoticeTimerRef.current = null;
  }, []);

  const clearSlowNoticeTimer = useCallback(() => {
    clearTrackedAIChatTimeout(trackedTimeoutsRef.current, slowNoticeTimerRef.current);
    slowNoticeTimerRef.current = null;
  }, []);

  const safeTimeout = useCallback((callback: () => void, delayMs: number) => {
    return scheduleTrackedAIChatTimeout(trackedTimeoutsRef.current, callback, delayMs);
  }, []);

  const clearTrackedTimeout = useCallback((timeoutId: number | null) => {
    clearTrackedAIChatTimeout(trackedTimeoutsRef.current, timeoutId);
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
    clearTrackedTimeout,
    isMountedRef,
    processingRef,
    requestControllerRef,
    safeTimeout,
    sessionRef,
    slowNoticeTimerRef,
    stopTyping,
    typingIntervalRef,
  };
}
