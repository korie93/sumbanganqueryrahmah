import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from "react";

import type { AIChatMessageInput } from "@/context/AIContext";
import type { AIChatStatus } from "@/lib/ai-chat";
import { resolveAiErrorMessage } from "@/lib/ai-error";
import { searchAI } from "@/lib/api";

import {
  AIChatRequestError,
  AI_CHAT_MAX_RETRIES,
  AI_CHAT_RETRY_MS,
  DEFAULT_AI_CHAT_ERROR_MESSAGE,
  formatAIChatQueuedNotice,
  readAIChatErrorResponse,
  readAIChatSuccessPayload,
} from "./ai-chat-utils";
import {
  canApplyAIChatUiUpdate,
  canRetryAIChatRequest,
  isAIChatAbortError,
  isActiveAIChatSession,
} from "./ai-chat-session-guards";

type UseAIChatRequestExecutorOptions = {
  abortActiveRequest: (reason?: string) => void;
  appendMessage: (message: AIChatMessageInput) => void;
  clearRequestTimeout: () => void;
  clearSlowNoticeTimer: () => void;
  isMountedRef: MutableRefObject<boolean>;
  processingRef: MutableRefObject<boolean>;
  registerRetryTimer: (timerId: number) => void;
  requestControllerRef: MutableRefObject<AbortController | null>;
  requestTimeoutRef: MutableRefObject<number | null>;
  sessionRef: MutableRefObject<number>;
  setAiStatus: Dispatch<SetStateAction<AIChatStatus>>;
  setGateNotice: Dispatch<SetStateAction<string | null>>;
  setIsProcessing: Dispatch<SetStateAction<boolean>>;
  setIsThinking: Dispatch<SetStateAction<boolean>>;
  setSlowNotice: Dispatch<SetStateAction<boolean>>;
  setStreamingText: Dispatch<SetStateAction<string>>;
  startTyping: (text: string, sessionId: number) => void;
  timeoutMs: number;
  unregisterRetryTimer: (timerId: number) => void;
};

export function useAIChatRequestExecutor({
  abortActiveRequest,
  appendMessage,
  clearRequestTimeout,
  clearSlowNoticeTimer,
  isMountedRef,
  processingRef,
  registerRetryTimer,
  requestControllerRef,
  requestTimeoutRef,
  sessionRef,
  setAiStatus,
  setGateNotice,
  setIsProcessing,
  setIsThinking,
  setSlowNotice,
  setStreamingText,
  startTyping,
  timeoutMs,
  unregisterRetryTimer,
}: UseAIChatRequestExecutorOptions) {
  const finishAsyncCycle = useCallback((options?: {
    clearStreamingText?: boolean;
    gateNotice?: string | null;
  }) => {
    processingRef.current = false;
    if (isMountedRef.current) {
      setIsProcessing(false);
      setIsThinking(false);
      setAiStatus("IDLE");
      setSlowNotice(false);
      if (options?.clearStreamingText) {
        setStreamingText("");
      }
      if (options && "gateNotice" in options) {
        setGateNotice(options.gateNotice ?? null);
      }
    }
    clearSlowNoticeTimer();
    clearRequestTimeout();
  }, [
    clearRequestTimeout,
    clearSlowNoticeTimer,
    isMountedRef,
    processingRef,
    setAiStatus,
    setGateNotice,
    setIsProcessing,
    setIsThinking,
    setSlowNotice,
    setStreamingText,
  ]);

  const executeSearch = useCallback(async (text: string, sessionId: number, retryCount = 0) => {
    if (!isActiveAIChatSession(sessionId, sessionRef)) {
      return;
    }

    abortActiveRequest("superseded");
    clearRequestTimeout();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    let waitingRetry = false;
    let startedTyping = false;
    const timeoutId = window.setTimeout(() => controller.abort("timeout"), timeoutMs);
    requestTimeoutRef.current = timeoutId;

    try {
      const response = await searchAI(text, { signal: controller.signal });

      if (!isActiveAIChatSession(sessionId, sessionRef)) {
        return;
      }

      const gateWaitMs = Number(response.headers.get("x-ai-gate-wait-ms") || "0");
      if (!response.ok) {
        throw await readAIChatErrorResponse(response, DEFAULT_AI_CHAT_ERROR_MESSAGE);
      }

      const data = await readAIChatSuccessPayload(response, DEFAULT_AI_CHAT_ERROR_MESSAGE);
      if (!isActiveAIChatSession(sessionId, sessionRef)) {
        return;
      }

      if (gateWaitMs > 0 && canApplyAIChatUiUpdate(sessionId, sessionRef, isMountedRef)) {
        setGateNotice(formatAIChatQueuedNotice(gateWaitMs));
      }

      if (data?.processing) {
        if (canApplyAIChatUiUpdate(sessionId, sessionRef, isMountedRef)) {
          setAiStatus("PROCESSING");
        }
        if (retryCount >= AI_CHAT_MAX_RETRIES) {
          if (canApplyAIChatUiUpdate(sessionId, sessionRef, isMountedRef)) {
            appendMessage({
              role: "assistant",
              content: "Sistem masih memproses. Sila cuba semula sebentar lagi.",
              timestamp: new Date().toISOString(),
            });
          }
          finishAsyncCycle({
            clearStreamingText: true,
            gateNotice: null,
          });
          return;
        }

        waitingRetry = true;
        const timerId = window.setTimeout(() => {
          unregisterRetryTimer(timerId);
          if (!canRetryAIChatRequest(sessionId, sessionRef, isMountedRef, processingRef)) {
            return;
          }
          void executeSearch(text, sessionId, retryCount + 1);
        }, AI_CHAT_RETRY_MS + retryCount * 500);
        registerRetryTimer(timerId);
        return;
      }

      const outputText = String(data?.ai_explanation || "Tiada cadangan AI.");
      startedTyping = true;
      startTyping(outputText, sessionId);
    } catch (error: unknown) {
      if (isAIChatAbortError(error)) {
        return;
      }
      if (!canApplyAIChatUiUpdate(sessionId, sessionRef, isMountedRef)) {
        return;
      }
      const gateNotice = error instanceof AIChatRequestError ? error.gateNotice : null;
      appendMessage({
        role: "assistant",
        content: resolveAiErrorMessage(error),
        timestamp: new Date().toISOString(),
      });
      finishAsyncCycle({
        clearStreamingText: true,
        gateNotice,
      });
    } finally {
      window.clearTimeout(timeoutId);
      if (requestTimeoutRef.current === timeoutId) {
        requestTimeoutRef.current = null;
      }
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      if (
        !waitingRetry
        && !startedTyping
        && canApplyAIChatUiUpdate(sessionId, sessionRef, isMountedRef)
      ) {
        finishAsyncCycle();
      }
    }
  }, [
    abortActiveRequest,
    appendMessage,
    clearRequestTimeout,
    finishAsyncCycle,
    isMountedRef,
    processingRef,
    registerRetryTimer,
    requestControllerRef,
    requestTimeoutRef,
    sessionRef,
    setAiStatus,
    setGateNotice,
    startTyping,
    timeoutMs,
    unregisterRetryTimer,
  ]);

  return executeSearch;
}
