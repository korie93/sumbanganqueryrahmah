import { useCallback, useEffect, useRef, type Dispatch, type SetStateAction } from "react";

import {
  AIChatRequestError,
  AI_CHAT_CHARACTER_LIMIT_NOTICE,
  DEFAULT_AI_CHAT_ERROR_MESSAGE,
  isAIChatQueryOverLimit,
  readAIChatErrorResponse,
  readAIChatSuccessPayload,
} from "@/components/ai-chat-utils";
import type { AIChatMessage, AIChatMessageInput } from "@/context/AIContext";
import { searchAI } from "@/lib/api";
import type { AIChatStatus } from "@/lib/ai-chat";
import { resolveAiErrorMessage } from "@/lib/ai-error";
import { isRetryableAIChatFailure, takeAIChatFailedQuery, type AIChatFailedQuery } from "@/components/ai-chat-manual-retry";
import { stopAIChatResponse } from "@/components/ai-chat-stop-response";

import {
  AI_PAGE_MAX_RETRIES,
  AI_PAGE_RETRY_MS,
  appendAIPageMessage,
  formatAIQueuedNotice,
} from "./ai-page-controller-utils";
import type { AIPageRuntimeRefs } from "./useAIPageRuntimeRefs";
import { useAIPageTypingAction } from "./useAIPageTypingAction";

type UseAIPageActionsOptions = {
  aiEnabled: boolean;
  query: string;
  streamingText: string;
  resetSession: () => void;
  runtimeRefs: AIPageRuntimeRefs;
  setAiStatus: Dispatch<SetStateAction<AIChatStatus>>;
  setGateNotice: Dispatch<SetStateAction<string | null>>;
  setIsProcessing: Dispatch<SetStateAction<boolean>>;
  setIsThinking: Dispatch<SetStateAction<boolean>>;
  setIsTyping: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<AIChatMessage[]>>;
  setQuery: Dispatch<SetStateAction<string>>;
  setRetryAvailable: Dispatch<SetStateAction<boolean>>;
  setSlowNotice: Dispatch<SetStateAction<boolean>>;
  setStreamingText: Dispatch<SetStateAction<string>>;
  setStreamingTimestamp: Dispatch<SetStateAction<string>>;
  timeoutMs: number;
  typingIntervalMs: number;
};

export function useAIPageActions({
  aiEnabled,
  query,
  streamingText,
  resetSession,
  runtimeRefs,
  setAiStatus,
  setGateNotice,
  setIsProcessing,
  setIsThinking,
  setIsTyping,
  setMessages,
  setQuery,
  setRetryAvailable,
  setSlowNotice,
  setStreamingText,
  setStreamingTimestamp,
  timeoutMs,
  typingIntervalMs,
}: UseAIPageActionsOptions) {
  const failedQueryRef = useRef<AIChatFailedQuery | null>(null);
  const {
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
  } = runtimeRefs;

  const stopProcessingState = useCallback(() => {
    processingRef.current = false;
    pendingSendRef.current = false;
    if (isMountedRef.current) {
      setIsProcessing(false);
      setIsTyping(false);
      setIsThinking(false);
      setAiStatus("IDLE");
      setSlowNotice(false);
    }
  }, [
    isMountedRef,
    pendingSendRef,
    processingRef,
    setAiStatus,
    setIsProcessing,
    setIsThinking,
    setIsTyping,
    setSlowNotice,
  ]);

  const appendMessage = useCallback(
    (message: AIChatMessageInput) => {
      setMessages((previous) => appendAIPageMessage(previous, message));
    },
    [setMessages],
  );

  const cancelAI = useCallback(() => {
    failedQueryRef.current = null;
    sessionRef.current += 1;
    stopTyping();
    clearRetryTimers();
    clearSlowNoticeTimer();
    abortActiveRequest();
    if (isMountedRef.current) {
      setStreamingText("");
      setGateNotice(null);
      setRetryAvailable(false);
    }
    stopProcessingState();
  }, [
    abortActiveRequest,
    clearRetryTimers,
    clearSlowNoticeTimer,
    isMountedRef,
    sessionRef,
    setGateNotice,
    setRetryAvailable,
    setStreamingText,
    stopProcessingState,
    stopTyping,
  ]);

  const stopAIResponse = useCallback(() => {
    stopAIChatResponse({ appendMessage, cancelResponse: cancelAI, isMountedRef, processingRef, streamingText });
  }, [appendMessage, cancelAI, isMountedRef, processingRef, streamingText]);

  const resetChat = useCallback(() => {
    cancelAI();
    setQuery("");
    resetSession();
  }, [cancelAI, resetSession, setQuery]);

  useEffect(() => {
    if (!aiEnabled) cancelAI();
  }, [aiEnabled, cancelAI]);

  const startSlowNoticeWatch = useCallback(
    (sessionId: number) => {
      clearSlowNoticeTimer();
      slowNoticeTimerRef.current = window.setTimeout(() => {
        if (!isMountedRef.current) return;
        if (sessionRef.current !== sessionId) return;
        if (!processingRef.current) return;
        setSlowNotice(true);
      }, 1500);
    },
    [
      clearSlowNoticeTimer,
      isMountedRef,
      processingRef,
      sessionRef,
      setSlowNotice,
      slowNoticeTimerRef,
    ],
  );

  const startTyping = useAIPageTypingAction({
    appendMessage,
    runtimeRefs: {
      isMountedRef,
      sessionRef,
      stopTyping,
      typingTimerRef,
    },
    setAiStatus,
    setIsThinking,
    setIsTyping,
    setStreamingText,
    setStreamingTimestamp,
    stopProcessingState,
    typingIntervalMs,
  });

  const sendQuery = useCallback(
    async (text: string, isRetry = false, retryCount = 0, activeSessionId?: number, recordUserMessage = true) => {
      if (!text || !aiEnabled || !isMountedRef.current) return;
      if (!isRetry && (processingRef.current || pendingSendRef.current)) return;

      const sessionId = isRetry ? activeSessionId ?? sessionRef.current : sessionRef.current + 1;
      if (isRetry && (sessionRef.current !== sessionId || !processingRef.current)) return;

      if (!isRetry) {
        failedQueryRef.current = null;
        setRetryAvailable(false);
        sessionRef.current = sessionId;
        pendingSendRef.current = true;
        processingRef.current = true;
        setIsProcessing(true);
        setIsTyping(false);
        setAiStatus("SEARCHING");
        setSlowNotice(false);
        setGateNotice(null);
        setStreamingText("");
        startSlowNoticeWatch(sessionId);
        if (recordUserMessage) {
          appendMessage({
            role: "user",
            content: text,
            timestamp: new Date().toISOString(),
          });
        }
        setIsThinking(true);
      }

      abortActiveRequest();
      const controller = new AbortController();
      requestControllerRef.current = controller;
      let shouldStopProcessing = false;
      let waitingNextRetry = false;
      let timeoutId: number | null = null;
      let responseStatus: number | null = null;
      let retryAfter: string | null = null;

      try {
        timeoutId = window.setTimeout(() => controller.abort("timeout"), timeoutMs);
        const response = await searchAI(text, { signal: controller.signal });
        responseStatus = response.status;
        retryAfter = response.headers.get("retry-after");

        if (!isMountedRef.current || sessionRef.current !== sessionId) return;

        const gateWaitMs = Number(response.headers.get("x-ai-gate-wait-ms") || "0");
        if (!response.ok) {
          const error = await readAIChatErrorResponse(
            response,
            response.statusText || DEFAULT_AI_CHAT_ERROR_MESSAGE,
          );
          if (!isMountedRef.current || sessionRef.current !== sessionId) return;
          if (error.gateNotice) {
            setGateNotice(error.gateNotice);
          }
          throw error;
        }

        const data = await readAIChatSuccessPayload(response, DEFAULT_AI_CHAT_ERROR_MESSAGE);
        if (!isMountedRef.current || sessionRef.current !== sessionId) return;

        if (!isRetry && gateWaitMs > 0) {
          setGateNotice(formatAIQueuedNotice(gateWaitMs));
        }

        if (data?.processing) {
          setAiStatus("PROCESSING");
          if (retryCount >= AI_PAGE_MAX_RETRIES) {
            appendMessage({
              role: "assistant",
              content: "Sistem masih memproses. Sila klik Send sekali lagi selepas beberapa saat.",
              timestamp: new Date().toISOString(),
            });
            shouldStopProcessing = true;
            return;
          }

          if (!isRetry) {
            appendMessage({
              role: "assistant",
              content: data?.ai_explanation || "Sedang proses carian. Sila tunggu beberapa saat.",
              timestamp: new Date().toISOString(),
            });
          }

          waitingNextRetry = true;
          const timerId = window.setTimeout(() => {
            retryTimersRef.current = retryTimersRef.current.filter((existingId) => existingId !== timerId);
            if (!isMountedRef.current || sessionRef.current !== sessionId || !processingRef.current) return;
            void sendQuery(text, true, retryCount + 1, sessionId);
          }, AI_PAGE_RETRY_MS + retryCount * 500);
          retryTimersRef.current.push(timerId);
          return;
        }

        startTyping(data?.ai_explanation || "Tiada cadangan AI.", sessionId);
      } catch (error: unknown) {
        const err = error as { name?: string; message?: string };
        const isAbort = err?.name === "AbortError";
        const timedOut = controller.signal.aborted && controller.signal.reason === "timeout";
        if (!isMountedRef.current || sessionRef.current !== sessionId || ((isAbort || controller.signal.aborted) && !timedOut)) {
          return;
        }

        if (error instanceof AIChatRequestError && error.gateNotice) {
          setGateNotice(error.gateNotice);
        }
        const retryable = isRetryableAIChatFailure(error, {
          status: responseStatus,
          retryAfter,
          gateNotice: error instanceof AIChatRequestError ? error.gateNotice : null,
          timedOut,
        });
        failedQueryRef.current = retryable ? { text, sessionId } : null;
        setRetryAvailable(retryable);
        appendMessage({
          role: "assistant",
          content: timedOut ? DEFAULT_AI_CHAT_ERROR_MESSAGE : resolveAiErrorMessage(error),
          timestamp: new Date().toISOString(),
        });
        shouldStopProcessing = true;
      } finally {
        if (timeoutId !== null) {
          window.clearTimeout(timeoutId);
        }
        if (requestControllerRef.current === controller) {
          requestControllerRef.current = null;
        }
        if (shouldStopProcessing && isMountedRef.current && sessionRef.current === sessionId) {
          stopProcessingState();
        }
        if (waitingNextRetry && sessionRef.current === sessionId) {
          pendingSendRef.current = false;
        }
      }
    },
    [
      aiEnabled,
      abortActiveRequest,
      appendMessage,
      isMountedRef,
      pendingSendRef,
      processingRef,
      requestControllerRef,
      retryTimersRef,
      sessionRef,
      setAiStatus,
      setGateNotice,
      setIsProcessing,
      setIsThinking,
      setIsTyping,
      setRetryAvailable,
      setSlowNotice,
      setStreamingText,
      startSlowNoticeWatch,
      startTyping,
      stopProcessingState,
      timeoutMs,
    ],
  );

  const handleSend = useCallback(async () => {
    if (!aiEnabled) return;
    const trimmed = query.trim();
    if (!trimmed || processingRef.current || pendingSendRef.current) return;
    if (isAIChatQueryOverLimit(query)) {
      setGateNotice(AI_CHAT_CHARACTER_LIMIT_NOTICE);
      return;
    }
    setQuery("");
    await sendQuery(trimmed);
  }, [aiEnabled, pendingSendRef, processingRef, query, sendQuery, setGateNotice, setQuery]);

  const retryLastQuery = useCallback(async () => {
    if (!aiEnabled) return;
    const text = takeAIChatFailedQuery(failedQueryRef, sessionRef.current, isMountedRef.current,
      processingRef.current || pendingSendRef.current);
    if (text === null) return;
    setRetryAvailable(false);
    await sendQuery(text, false, 0, undefined, false);
  }, [aiEnabled, isMountedRef, pendingSendRef, processingRef, sendQuery, sessionRef, setRetryAvailable]);

  return {
    cancelAI,
    stopAIResponse,
    handleSend,
    resetChat,
    retryLastQuery,
  };
}
