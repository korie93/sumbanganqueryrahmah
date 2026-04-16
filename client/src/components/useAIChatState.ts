import { useCallback, useMemo, useRef, useState } from "react";

import { type AIChatMessageInput, useAIContext } from "@/context/AIContext";
import { type AIChatStatus } from "@/lib/ai-chat";
import { resolveAiErrorMessage } from "@/lib/ai-error";
import { searchAI } from "@/lib/api";

import {
  AIChatRequestError,
  AI_CHAT_MAX_RETRIES,
  AI_CHAT_RETRY_MS,
  DEFAULT_AI_CHAT_ERROR_MESSAGE,
  appendAIChatMessage,
  formatAIChatQueuedNotice,
  getAIChatStatusMeta,
  getAIChatTypingDelayMs,
  readAIChatErrorResponse,
  readAIChatSuccessPayload,
} from "./ai-chat-utils";
import { handleUnexpectedAIChatSendError } from "./ai-chat-send-guard";
import { createAIChatSessionAccessors } from "./ai-chat-session-accessors";
import { useAIChatExternalEffects } from "./useAIChatExternalEffects";
import { useAIChatRuntimeRefs } from "./useAIChatRuntimeRefs";
import { useAIChatTypingAction } from "./useAIChatTypingAction";

type UseAIChatStateOptions = {
  aiEnabled: boolean;
  isMobile: boolean;
  timeoutMs: number;
  onCancelAISearchReady?: ((cancelFn: () => void) => void) | undefined;
  onStatusChange?: ((status: AIChatStatus) => void) | undefined;
};

export function useAIChatState({
  aiEnabled,
  isMobile,
  timeoutMs,
  onCancelAISearchReady,
  onStatusChange,
}: UseAIChatStateOptions) {
  const { messages, setMessages, setIsThinking } = useAIContext();

  const isLowSpecMode =
    typeof document !== "undefined"
    && document.documentElement.classList.contains("low-spec");
  const typingDelayMs = getAIChatTypingDelayMs(isLowSpecMode);

  const [query, setQuery] = useState("");
  const [aiStatus, setAiStatus] = useState<AIChatStatus>("IDLE");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [slowNotice, setSlowNotice] = useState(false);
  const [gateNotice, setGateNotice] = useState<string | null>(null);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const {
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
  } = useAIChatRuntimeRefs({ setIsTyping });

  const appendMessage = useCallback((message: AIChatMessageInput) => {
    setMessages((prev) => appendAIChatMessage(prev, message));
  }, [setMessages]);

  const cancelAISearch = useCallback((incrementSession = true) => {
    if (incrementSession) {
      sessionRef.current += 1;
    }

    abortActiveRequest();
    clearRetryTimers();
    clearSlowNoticeTimer();
    stopTyping();

    if (isMountedRef.current) {
      setStreamingText("");
      setSlowNotice(false);
      setGateNotice(null);
    }

    processingRef.current = false;
    if (isMountedRef.current) {
      setIsProcessing(false);
      setIsThinking(false);
      setAiStatus("IDLE");
    }
  }, [abortActiveRequest, clearRetryTimers, clearSlowNoticeTimer, setIsThinking, stopTyping]);

  const resetSession = useCallback(() => {
    cancelAISearch(true);
    setMessages([]);
    setQuery("");
  }, [cancelAISearch, setMessages]);

  const startTyping = useAIChatTypingAction({
    appendMessage,
    clearSlowNoticeTimer,
    isMountedRef,
    processingRef,
    sessionRef,
    setAiStatus,
    setIsProcessing,
    setIsThinking,
    setIsTyping,
    setSlowNotice,
    setStreamingText,
    stopTyping,
    typingDelayMs,
    typingIntervalRef,
  });
  const { canApplyUiUpdate, canRetryRequest, isActiveSession } = useMemo(
    () => createAIChatSessionAccessors(sessionRef, isMountedRef, processingRef),
    [isMountedRef, processingRef, sessionRef],
  );

  const startSlowNoticeWatch = useCallback((sessionId: number) => {
    clearSlowNoticeTimer();
    slowNoticeTimerRef.current = safeTimeout(() => {
      if (!canRetryRequest(sessionId)) {
        return;
      }
      setSlowNotice(true);
    }, 1500);
  }, [canRetryRequest, clearSlowNoticeTimer, safeTimeout]);

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
  }, [clearSlowNoticeTimer, setIsThinking]);

  const executeSearch = useCallback(async (text: string, sessionId: number, retryCount = 0) => {
    if (!isActiveSession(sessionId)) {
      return;
    }

    abortActiveRequest();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    let waitingRetry = false;
    let startedTyping = false;
    let timeoutId: number | null = null;

    try {
      timeoutId = safeTimeout(() => {
        controller.abort();
      }, timeoutMs);
      const response = await searchAI(text, { signal: controller.signal });

      if (!isActiveSession(sessionId)) {
        return;
      }

      const gateWaitMs = Number(response.headers.get("x-ai-gate-wait-ms") || "0");
      if (!response.ok) {
        throw await readAIChatErrorResponse(response, DEFAULT_AI_CHAT_ERROR_MESSAGE);
      }

      const data = await readAIChatSuccessPayload(response, DEFAULT_AI_CHAT_ERROR_MESSAGE);
      if (!isActiveSession(sessionId)) {
        return;
      }

      if (gateWaitMs > 0 && canApplyUiUpdate(sessionId)) {
        setGateNotice(formatAIChatQueuedNotice(gateWaitMs));
      }

      if (data?.processing) {
        if (canApplyUiUpdate(sessionId)) {
          setAiStatus("PROCESSING");
        }
        if (retryCount >= AI_CHAT_MAX_RETRIES) {
          if (canApplyUiUpdate(sessionId)) {
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
        safeTimeout(() => {
          if (!canRetryRequest(sessionId)) {
            return;
          }
          void executeSearch(text, sessionId, retryCount + 1);
        }, AI_CHAT_RETRY_MS + retryCount * 500);
        return;
      }

      const outputText = String(data?.ai_explanation || "Tiada cadangan AI.");
      startedTyping = true;
      startTyping(outputText, sessionId);
    } catch (error: unknown) {
      const err = error as { name?: string };
      if (err?.name === "AbortError") {
        return;
      }
      if (!canApplyUiUpdate(sessionId)) {
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
      clearTrackedTimeout(timeoutId);
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      if (
        !waitingRetry
        && !startedTyping
        && canApplyUiUpdate(sessionId)
      ) {
        finishAsyncCycle();
      }
    }
  }, [
    abortActiveRequest,
    appendMessage,
    canApplyUiUpdate,
    canRetryRequest,
    clearTrackedTimeout,
    finishAsyncCycle,
    isActiveSession,
    safeTimeout,
    startTyping,
    timeoutMs,
  ]);

  const handleSend = useCallback(async () => {
    if (!aiEnabled) {
      return;
    }
    const trimmed = query.trim();
    if (!trimmed || processingRef.current) {
      return;
    }

    let sessionId: number | null = null;

    try {
      cancelAISearch(false);
      sessionRef.current += 1;
      sessionId = sessionRef.current;

      setQuery("");
      setGateNotice(null);
      setSlowNotice(false);
      setAiStatus("SEARCHING");
      processingRef.current = true;
      setIsProcessing(true);
      setIsThinking(true);
      setIsTyping(false);

      appendMessage({
        role: "user",
        content: trimmed,
        timestamp: new Date().toISOString(),
      });

      if (isMobile) {
        textareaRef.current?.blur();
      }

      startSlowNoticeWatch(sessionId);
      await executeSearch(trimmed, sessionId, 0);
    } catch (error: unknown) {
      handleUnexpectedAIChatSendError({
        error,
        sessionId,
        canApplyUiUpdate,
        appendMessage,
        finishAsyncCycle,
      });
    }
  }, [
    aiEnabled,
    appendMessage,
    canApplyUiUpdate,
    cancelAISearch,
    executeSearch,
    finishAsyncCycle,
    isMobile,
    query,
    setIsThinking,
    startSlowNoticeWatch,
  ]);

  useAIChatExternalEffects({
    aiStatus,
    cancelAISearch,
    messages,
    messagesRef,
    onCancelAISearchReady,
    onStatusChange,
    resetSession,
    streamingText,
  });

  const statusMeta = useMemo(() => getAIChatStatusMeta(aiStatus), [aiStatus]);

  return {
    aiStatus,
    cancelAISearch,
    gateNotice,
    handleSend,
    isProcessing,
    isTyping,
    messages,
    messagesRef,
    query,
    setQuery,
    showActions: isProcessing || isTyping,
    slowNotice,
    statusMeta,
    streamingText,
    textareaRef,
  };
}
