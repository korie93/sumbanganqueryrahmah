import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { type AIChatMessage, useAIContext } from "@/context/AIContext";
import {
  AI_CANCEL_EVENT,
  AI_RESET_EVENT,
  type AIChatStatus,
} from "@/lib/ai-chat";
import { resolveAiErrorMessage } from "@/lib/ai-error";
import { searchAI } from "@/lib/api";

import {
  AI_CHAT_MAX_RETRIES,
  AI_CHAT_RETRY_MS,
  appendAIChatMessage,
  getAIChatStatusMeta,
  getAIChatTypingDelayMs,
} from "./ai-chat-utils";

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
      isMountedRef.current = false;
    };
  }, []);

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
    if (typingIntervalRef.current !== null) {
      window.clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
    if (isMountedRef.current) {
      setIsTyping(false);
    }
  }, []);

  const appendMessage = useCallback((message: AIChatMessage) => {
    setMessages((prev) => appendAIChatMessage(prev, message));
  }, [setMessages]);

  const cancelAISearch = useCallback((incrementSession = true) => {
    if (incrementSession) {
      sessionRef.current += 1;
    }

    if (requestControllerRef.current) {
      requestControllerRef.current.abort();
      requestControllerRef.current = null;
    }

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
  }, [clearRetryTimers, clearSlowNoticeTimer, setIsThinking, stopTyping]);

  const resetSession = useCallback(() => {
    cancelAISearch(true);
    setMessages([]);
    setQuery("");
  }, [cancelAISearch, setMessages]);

  useEffect(() => {
    onCancelAISearchReady?.(() => cancelAISearch(true));
    return () => {
      onCancelAISearchReady?.(() => undefined);
    };
  }, [cancelAISearch, onCancelAISearchReady]);

  useEffect(() => {
    onStatusChange?.(aiStatus);
  }, [aiStatus, onStatusChange]);

  useEffect(() => {
    const current = messagesRef.current;
    if (!current) {
      return;
    }
    current.scrollTop = current.scrollHeight;
  }, [messages, streamingText, aiStatus]);

  const startTyping = useCallback((text: string, sessionId: number) => {
    stopTyping();
    setIsTyping(true);
    setAiStatus("TYPING");
    setStreamingText("");

    let index = 0;
    typingIntervalRef.current = window.setInterval(() => {
      if (sessionId !== sessionRef.current) {
        stopTyping();
        return;
      }

      index += 1;
      setStreamingText(text.slice(0, index));

      if (index >= text.length) {
        stopTyping();
        if (sessionId !== sessionRef.current) {
          return;
        }

        if (isMountedRef.current) {
          setStreamingText("");
        }

        appendMessage({
          role: "assistant",
          content: text,
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
      }
    }, typingDelayMs);
  }, [appendMessage, clearSlowNoticeTimer, setIsThinking, stopTyping, typingDelayMs]);

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

    if (requestControllerRef.current) {
      requestControllerRef.current.abort();
    }

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
        let responseMessage = "AI tidak dapat memproses permintaan sekarang.\nSila cuba semula.";
        const contentType = String(response.headers.get("content-type") || "").toLowerCase();

        if (contentType.includes("application/json")) {
          const payload = await response.json();
          const message = typeof payload?.message === "string" ? payload.message.trim() : "";
          if (message) {
            responseMessage = message;
          }

          const gate = payload?.gate;
          if (gate && Number.isFinite(Number(gate.queueSize)) && Number.isFinite(Number(gate.queueLimit))) {
            const queueSize = Number(gate.queueSize);
            const queueLimit = Number(gate.queueLimit);
            const waitMs = Number(gate.queueWaitMs || 0);
            setGateNotice(
              waitMs > 0
                ? `AI queue busy (${queueSize}/${queueLimit}). Estimated wait ${Math.max(1, Math.round(waitMs / 1000))}s.`
                : `AI queue busy (${queueSize}/${queueLimit}). Please retry shortly.`,
            );
          }
        }

        throw new Error(responseMessage);
      }

      const data = await response.json();
      if (sessionId !== sessionRef.current) {
        return;
      }

      if (gateWaitMs > 0) {
        setGateNotice(
          `AI request queued for ${Math.max(1, Math.round(gateWaitMs / 1000))}s due to current traffic.`,
        );
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
          retryTimersRef.current = retryTimersRef.current.filter((existingId) => existingId !== timerId);
          void executeSearch(text, sessionId, retryCount + 1);
        }, AI_CHAT_RETRY_MS + retryCount * 500);
        retryTimersRef.current.push(timerId);
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
  }, [appendMessage, clearSlowNoticeTimer, setIsThinking, startTyping, timeoutMs]);

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

  useEffect(() => {
    const onReset = () => {
      resetSession();
    };
    const onCancel = () => {
      cancelAISearch(true);
    };

    window.addEventListener(AI_RESET_EVENT, onReset as EventListener);
    window.addEventListener(AI_CANCEL_EVENT, onCancel as EventListener);

    return () => {
      window.removeEventListener(AI_RESET_EVENT, onReset as EventListener);
      window.removeEventListener(AI_CANCEL_EVENT, onCancel as EventListener);
      cancelAISearch(true);
    };
  }, [cancelAISearch, resetSession]);

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
