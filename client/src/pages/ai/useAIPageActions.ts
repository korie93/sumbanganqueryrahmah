import { useCallback, type Dispatch, type SetStateAction } from "react";

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
  resetSession: () => void;
  runtimeRefs: AIPageRuntimeRefs;
  setAiStatus: Dispatch<SetStateAction<AIChatStatus>>;
  setGateNotice: Dispatch<SetStateAction<string | null>>;
  setIsProcessing: Dispatch<SetStateAction<boolean>>;
  setIsThinking: Dispatch<SetStateAction<boolean>>;
  setIsTyping: Dispatch<SetStateAction<boolean>>;
  setMessages: Dispatch<SetStateAction<AIChatMessage[]>>;
  setQuery: Dispatch<SetStateAction<string>>;
  setSlowNotice: Dispatch<SetStateAction<boolean>>;
  setStreamingText: Dispatch<SetStateAction<string>>;
  setStreamingTimestamp: Dispatch<SetStateAction<string>>;
  timeoutMs: number;
  typingIntervalMs: number;
};

export function useAIPageActions({
  aiEnabled,
  query,
  resetSession,
  runtimeRefs,
  setAiStatus,
  setGateNotice,
  setIsProcessing,
  setIsThinking,
  setIsTyping,
  setMessages,
  setQuery,
  setSlowNotice,
  setStreamingText,
  setStreamingTimestamp,
  timeoutMs,
  typingIntervalMs,
}: UseAIPageActionsOptions) {
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
    sessionRef.current += 1;
    stopTyping();
    clearRetryTimers();
    clearSlowNoticeTimer();
    abortActiveRequest();
    if (isMountedRef.current) {
      setStreamingText("");
      setGateNotice(null);
    }
    stopProcessingState();
  }, [
    abortActiveRequest,
    clearRetryTimers,
    clearSlowNoticeTimer,
    isMountedRef,
    sessionRef,
    setGateNotice,
    setStreamingText,
    stopProcessingState,
    stopTyping,
  ]);

  const resetChat = useCallback(() => {
    cancelAI();
    setQuery("");
    resetSession();
  }, [cancelAI, resetSession, setQuery]);

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
    async (text: string, isRetry = false, retryCount = 0, activeSessionId?: number) => {
      if (!text) return;
      if (!isRetry && (processingRef.current || pendingSendRef.current)) return;

      const sessionId = isRetry ? activeSessionId ?? sessionRef.current : sessionRef.current + 1;

      if (!isRetry) {
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
        appendMessage({
          role: "user",
          content: text,
          timestamp: new Date().toISOString(),
        });
        setIsThinking(true);
      }

      abortActiveRequest();
      const controller = new AbortController();
      requestControllerRef.current = controller;
      let shouldStopProcessing = false;
      let waitingNextRetry = false;
      let timeoutId: number | null = null;

      try {
        timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
        const response = await searchAI(text, { signal: controller.signal });

        if (sessionRef.current !== sessionId) return;

        const gateWaitMs = Number(response.headers.get("x-ai-gate-wait-ms") || "0");
        if (!response.ok) {
          const error = await readAIChatErrorResponse(
            response,
            response.statusText || DEFAULT_AI_CHAT_ERROR_MESSAGE,
          );
          if (error.gateNotice) {
            setGateNotice(error.gateNotice);
          }
          throw error;
        }

        const data = await readAIChatSuccessPayload(response, DEFAULT_AI_CHAT_ERROR_MESSAGE);
        if (sessionRef.current !== sessionId) return;

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
            void sendQuery(text, true, retryCount + 1, sessionId);
          }, AI_PAGE_RETRY_MS + retryCount * 500);
          retryTimersRef.current.push(timerId);
          return;
        }

        startTyping(data?.ai_explanation || "Tiada cadangan AI.", sessionId);
      } catch (error: unknown) {
        const err = error as { name?: string; message?: string };
        const isAbort = err?.name === "AbortError";
        if (isAbort || sessionRef.current !== sessionId) {
          return;
        }

        if (error instanceof AIChatRequestError && error.gateNotice) {
          setGateNotice(error.gateNotice);
        }
        appendMessage({
          role: "assistant",
          content: resolveAiErrorMessage(error),
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
        if (waitingNextRetry) {
          pendingSendRef.current = false;
        }
      }
    },
    [
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

  return {
    cancelAI,
    handleSend,
    resetChat,
  };
}
