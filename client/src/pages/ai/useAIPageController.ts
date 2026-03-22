import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, PencilLine, Search, type LucideIcon } from "lucide-react";
import { type AIChatMessage, useAIContext } from "@/context/AIContext";
import { AI_CANCEL_EVENT, AI_RESET_EVENT, type AIChatStatus } from "@/lib/ai-chat";
import { getCsrfHeader } from "@/lib/api/shared";

export interface AIPageStatusContent {
  icon: LucideIcon;
  text: string;
  className: string;
}

interface UseAIPageControllerOptions {
  timeoutMs: number;
  aiEnabled: boolean;
  typingIntervalMs: number;
}

export function useAIPageController({
  timeoutMs,
  aiEnabled,
  typingIntervalMs,
}: UseAIPageControllerOptions) {
  const MAX_CHAT_MESSAGES = 50;
  const RETRY_MS = 2500;
  const MAX_RETRIES = 6;
  const { messages, isThinking, setIsThinking, setMessages, resetSession } = useAIContext();

  const [query, setQuery] = useState("");
  const [aiStatus, setAiStatus] = useState<AIChatStatus>("IDLE");
  const [gateNotice, setGateNotice] = useState<string | null>(null);
  const [slowNotice, setSlowNotice] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingTimestamp, setStreamingTimestamp] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const pendingSendRef = useRef(false);
  const processingRef = useRef(false);
  const requestControllerRef = useRef<AbortController | null>(null);
  const sessionRef = useRef(0);
  const typingTimerRef = useRef<number | null>(null);
  const slowNoticeTimerRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const retryTimersRef = useRef<number[]>([]);

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
    if (typingTimerRef.current !== null) {
      window.clearInterval(typingTimerRef.current);
      typingTimerRef.current = null;
    }
  }, []);

  const abortActiveRequest = useCallback(() => {
    if (requestControllerRef.current) {
      requestControllerRef.current.abort();
      requestControllerRef.current = null;
    }
  }, []);

  const stopProcessingState = useCallback(() => {
    processingRef.current = false;
    pendingSendRef.current = false;
    setIsProcessing(false);
    setIsTyping(false);
    setIsThinking(false);
    setAiStatus("IDLE");
    setSlowNotice(false);
  }, [setIsThinking]);

  const appendMessage = useCallback(
    (message: AIChatMessage) => {
      setMessages((previous) => {
        const next = [...previous, message];
        if (next.length <= MAX_CHAT_MESSAGES) return next;
        return next.slice(next.length - MAX_CHAT_MESSAGES);
      });
    },
    [setMessages],
  );

  const cancelAI = useCallback(() => {
    sessionRef.current += 1;
    stopTyping();
    clearRetryTimers();
    clearSlowNoticeTimer();
    abortActiveRequest();
    setStreamingText("");
    stopProcessingState();
  }, [abortActiveRequest, clearRetryTimers, clearSlowNoticeTimer, stopProcessingState, stopTyping]);

  const resetChat = useCallback(() => {
    cancelAI();
    setGateNotice(null);
    setQuery("");
    resetSession();
  }, [cancelAI, resetSession]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      cancelAI();
    };
  }, [cancelAI]);

  useEffect(() => {
    const onReset = () => {
      resetChat();
    };
    const onCancel = () => {
      cancelAI();
    };

    window.addEventListener(AI_RESET_EVENT, onReset as EventListener);
    window.addEventListener(AI_CANCEL_EVENT, onCancel as EventListener);

    return () => {
      window.removeEventListener(AI_RESET_EVENT, onReset as EventListener);
      window.removeEventListener(AI_CANCEL_EVENT, onCancel as EventListener);
    };
  }, [cancelAI, resetChat]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages, isThinking, isTyping, streamingText]);

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
    [clearSlowNoticeTimer],
  );

  const startTyping = useCallback(
    (text: string, sessionId: number) => {
      stopTyping();
      setStreamingText("");
      setStreamingTimestamp(new Date().toISOString());

      if (!text.trim()) {
        appendMessage({
          role: "assistant",
          content: "Tiada cadangan AI.",
          timestamp: new Date().toISOString(),
        });
        stopProcessingState();
        return;
      }

      setIsTyping(true);
      setAiStatus("TYPING");
      setIsThinking(true);
      let index = 0;

      typingTimerRef.current = window.setInterval(() => {
        if (!isMountedRef.current || sessionRef.current !== sessionId) {
          stopTyping();
          return;
        }

        index += 1;
        setStreamingText(text.slice(0, index));

        if (index >= text.length) {
          stopTyping();
          if (!isMountedRef.current || sessionRef.current !== sessionId) return;
          setStreamingText("");
          appendMessage({
            role: "assistant",
            content: text,
            timestamp: new Date().toISOString(),
          });
          stopProcessingState();
        }
      }, typingIntervalMs);
    },
    [appendMessage, setIsThinking, stopProcessingState, stopTyping, typingIntervalMs],
  );

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

      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...(getCsrfHeader() as Record<string, string>),
        };

        const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetch("/api/ai/search", {
          method: "POST",
          headers,
          body: JSON.stringify({ query: text }),
          credentials: "include",
          signal: controller.signal,
        });
        window.clearTimeout(timeoutId);

        if (sessionRef.current !== sessionId) return;

        const gateWaitMs = Number(response.headers.get("x-ai-gate-wait-ms") || "0");
        if (!response.ok) {
          let responseMessage = response.statusText || "AI request failed.";
          const contentType = String(response.headers.get("content-type") || "").toLowerCase();

          if (contentType.includes("application/json")) {
            const payload = await response.json();
            const gate = payload?.gate;
            if (typeof payload?.message === "string" && payload.message.trim()) {
              responseMessage = payload.message.trim();
            }
            if (
              gate &&
              Number.isFinite(Number(gate.queueSize)) &&
              Number.isFinite(Number(gate.queueLimit))
            ) {
              const queueSize = Number(gate.queueSize);
              const queueLimit = Number(gate.queueLimit);
              const waitMs = Number(gate.queueWaitMs || 0);
              setGateNotice(
                waitMs > 0
                  ? `AI queue busy (${queueSize}/${queueLimit}). Estimated wait ${Math.max(1, Math.round(waitMs / 1000))}s.`
                  : `AI queue busy (${queueSize}/${queueLimit}). Please retry shortly.`,
              );
            }
          } else {
            const responseText = (await response.text()).trim();
            if (responseText) responseMessage = responseText;
          }

          throw new Error(responseMessage);
        }

        const data = await response.json();
        if (sessionRef.current !== sessionId) return;

        if (!isRetry && gateWaitMs > 0) {
          setGateNotice(
            `AI request queued for ${Math.max(1, Math.round(gateWaitMs / 1000))}s due to current traffic.`,
          );
        }

        if (data?.processing) {
          setAiStatus("PROCESSING");
          if (retryCount >= MAX_RETRIES) {
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
            void sendQuery(text, true, retryCount + 1, sessionId);
          }, RETRY_MS + retryCount * 500);
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

        appendMessage({
          role: "assistant",
          content: err?.message || "AI tidak dapat memproses permintaan sekarang.\nSila cuba semula.",
          timestamp: new Date().toISOString(),
        });
        shouldStopProcessing = true;
      } finally {
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
      setIsThinking,
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
    setQuery("");
    await sendQuery(trimmed);
  }, [aiEnabled, query, sendQuery]);

  const statusContent = useMemo<AIPageStatusContent>(() => {
    if (aiStatus === "SEARCHING") {
      return {
        icon: Search,
        text: "AI sedang mencari maklumat...",
        className: "border-blue-500/35 bg-blue-500/10 text-blue-700 dark:text-blue-300",
      };
    }
    if (aiStatus === "PROCESSING") {
      return {
        icon: Brain,
        text: "AI sedang memproses data...",
        className: "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      };
    }
    if (aiStatus === "TYPING") {
      return {
        icon: PencilLine,
        text: "AI sedang menaip jawapan...",
        className: "border-emerald-500/35 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
      };
    }
    return {
      icon: Search,
      text: "AI idle.",
      className: "border-border bg-muted/30 text-muted-foreground",
    };
  }, [aiStatus]);

  return {
    messages,
    isThinking,
    query,
    aiStatus,
    gateNotice,
    slowNotice,
    streamingText,
    streamingTimestamp,
    isProcessing,
    isTyping,
    messagesContainerRef,
    statusContent,
    setQuery,
    handleSend,
    cancelAI,
    resetChat,
  };
}
