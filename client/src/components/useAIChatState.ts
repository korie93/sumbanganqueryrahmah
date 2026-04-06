import { useCallback, useMemo, useRef, useState } from "react";

import { type AIChatMessage, useAIContext } from "@/context/AIContext";
import { type AIChatStatus } from "@/lib/ai-chat";
import { resolveAiErrorMessage } from "@/lib/ai-error";
import { searchAI } from "@/lib/api";

import {
  AI_CHAT_MAX_RETRIES,
  AI_CHAT_RETRY_MS,
  DEFAULT_AI_CHAT_ERROR_MESSAGE,
  appendAIChatMessage,
  formatAIChatQueuedNotice,
  getAIChatErrorDetailsFromPayload,
  getAIChatStatusMeta,
  getAIChatTypingDelayMs,
} from "./ai-chat-utils";
import { useAIChatExternalEffects } from "./useAIChatExternalEffects";
import { useAIChatRuntimeRefs } from "./useAIChatRuntimeRefs";
import { useAIChatTypingAction } from "./useAIChatTypingAction";

type UseAIChatStateOptions = {
  aiEnabled: boolean;
  isMobile: boolean;
  timeoutMs: number;
  onCancelAISearchReady?: (cancelFn: () => void) => void;
  onStatusChange?: (status: AIChatStatus) => void;
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
    isMountedRef,
    processingRef,
    registerRetryTimer,
    requestControllerRef,
    sessionRef,
    slowNoticeTimerRef,
    stopTyping,
    typingIntervalRef,
    unregisterRetryTimer,
  } = useAIChatRuntimeRefs({ setIsTyping });

  const appendMessage = useCallback((message: AIChatMessage) => {
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

  const startSlowNoticeWatch = useCallback((sessionId: number) => {
    clearSlowNoticeTimer();
    slowNoticeTimerRef.current = window.setTimeout(() => {
      if (sessionId !== sessionRef.current || !processingRef.current) {
        return;
      }
      setSlowNotice(true);
    }, 1500);
  }, [clearSlowNoticeTimer]);

  const executeSearch = useCallback(async (text: string, sessionId: number, retryCount = 0) => {
    if (sessionId !== sessionRef.current) {
      return;
    }

    abortActiveRequest();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    let waitingRetry = false;
    let startedTyping = false;
    let timeoutId: number | null = null;

    try {
      timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      const response = await searchAI(text, { signal: controller.signal });

      if (sessionId !== sessionRef.current) {
        return;
      }

      const gateWaitMs = Number(response.headers.get("x-ai-gate-wait-ms") || "0");
      if (!response.ok) {
        let responseMessage = DEFAULT_AI_CHAT_ERROR_MESSAGE;
        const contentType = String(response.headers.get("content-type") || "").toLowerCase();

        if (contentType.includes("application/json")) {
          const payload = await response.json();
          const details = getAIChatErrorDetailsFromPayload(payload);
          responseMessage = details.message;
          if (details.gateNotice) {
            setGateNotice(details.gateNotice);
          }
        }

        throw new Error(responseMessage);
      }

      const data = await response.json();
      if (sessionId !== sessionRef.current) {
        return;
      }

      if (gateWaitMs > 0) {
        setGateNotice(formatAIChatQueuedNotice(gateWaitMs));
      }

      if (data?.processing) {
        setAiStatus("PROCESSING");
        if (retryCount >= AI_CHAT_MAX_RETRIES) {
          appendMessage({
            role: "assistant",
            content: "Sistem masih memproses. Sila cuba semula sebentar lagi.",
            timestamp: new Date().toISOString(),
          });
          processingRef.current = false;
          setIsProcessing(false);
          setIsThinking(false);
          setAiStatus("IDLE");
          setSlowNotice(false);
          clearSlowNoticeTimer();
          return;
        }

        waitingRetry = true;
        const timerId = window.setTimeout(() => {
          unregisterRetryTimer(timerId);
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
      if (sessionId !== sessionRef.current) {
        return;
      }
      appendMessage({
        role: "assistant",
        content: resolveAiErrorMessage(error),
        timestamp: new Date().toISOString(),
      });
      processingRef.current = false;
      if (isMountedRef.current) {
        setIsProcessing(false);
        setIsThinking(false);
        setAiStatus("IDLE");
        setSlowNotice(false);
      }
      clearSlowNoticeTimer();
    } finally {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      if (!waitingRetry && !startedTyping && sessionId === sessionRef.current) {
        processingRef.current = false;
        if (isMountedRef.current) {
          setIsProcessing(false);
          setIsThinking(false);
          setAiStatus("IDLE");
          setSlowNotice(false);
        }
        clearSlowNoticeTimer();
      }
    }
  }, [
    abortActiveRequest,
    appendMessage,
    clearSlowNoticeTimer,
    registerRetryTimer,
    setIsThinking,
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
