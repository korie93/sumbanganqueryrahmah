import { useCallback, useMemo, useRef, useState } from "react";

import { type AIChatMessageInput, useAIContext } from "@/context/AIContext";
import { type AIChatStatus } from "@/lib/ai-chat";
import { resolveAiErrorMessage } from "@/lib/ai-error";
import { searchAI } from "@/lib/api";

import {
  AIChatRequestError,
  AI_CHAT_MAX_RETRIES,
  AI_CHAT_RETRY_MS,
  AI_CHAT_CHARACTER_LIMIT_NOTICE,
  DEFAULT_AI_CHAT_ERROR_MESSAGE,
  appendAIChatMessage,
  formatAIChatQueuedNotice,
  getAIChatStatusMeta,
  getAIChatTypingDelayMs,
  isAIChatQueryOverLimit,
  normalizeAIChatQueryInput,
  readAIChatErrorResponse,
  readAIChatSuccessPayload,
} from "./ai-chat-utils";
import {
  canApplyAIChatUiUpdate,
  canRetryAIChatRequest,
  isActiveAIChatSession,
} from "./ai-chat-session-guards";
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
    clearRequestTimeout();
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
  }, [
    abortActiveRequest,
    clearRequestTimeout,
    clearRetryTimers,
    clearSlowNoticeTimer,
    isMountedRef,
    processingRef,
    sessionRef,
    setIsThinking,
    stopTyping,
  ]);

  const updateQuery = useCallback((value: string) => {
    const normalized = normalizeAIChatQueryInput(value);
    setQuery(normalized);
    if (value.length > normalized.length) {
      setGateNotice(AI_CHAT_CHARACTER_LIMIT_NOTICE);
      return;
    }
    if (gateNotice === AI_CHAT_CHARACTER_LIMIT_NOTICE) {
      setGateNotice(null);
    }
  }, [gateNotice]);

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

  const startSlowNoticeWatch = useCallback((sessionId: number) => {
    clearSlowNoticeTimer();
    slowNoticeTimerRef.current = window.setTimeout(() => {
      if (!canRetryAIChatRequest(sessionId, sessionRef, isMountedRef, processingRef)) {
        return;
      }
      setSlowNotice(true);
    }, 1500);
  }, [clearSlowNoticeTimer, isMountedRef, processingRef, sessionRef, slowNoticeTimerRef]);

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
    setIsThinking,
  ]);

  const executeSearch = useCallback(async (text: string, sessionId: number, retryCount = 0) => {
    if (!isActiveAIChatSession(sessionId, sessionRef)) {
      return;
    }

    abortActiveRequest();
    clearRequestTimeout();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    let waitingRetry = false;
    let startedTyping = false;
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
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
      const err = error as { name?: string };
      if (err?.name === "AbortError") {
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
    requestControllerRef,
    registerRetryTimer,
    requestTimeoutRef,
    sessionRef,
    startTyping,
    timeoutMs,
    unregisterRetryTimer,
  ]);

  const handleSend = useCallback(async () => {
    if (!aiEnabled) {
      return;
    }
    const trimmed = query.trim();
    if (!trimmed || processingRef.current) {
      return;
    }
    if (isAIChatQueryOverLimit(query)) {
      setGateNotice(AI_CHAT_CHARACTER_LIMIT_NOTICE);
      return;
    }

    cancelAISearch(false);
    sessionRef.current += 1;
    const sessionId = sessionRef.current;

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
  }, [
    aiEnabled,
    appendMessage,
    cancelAISearch,
    executeSearch,
    isMobile,
    processingRef,
    query,
    setIsThinking,
    sessionRef,
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
    setQuery: updateQuery,
    showActions: isProcessing || isTyping,
    slowNotice,
    statusMeta,
    streamingText,
    textareaRef,
  };
}
