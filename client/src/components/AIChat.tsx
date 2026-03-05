import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, Loader2, PencilLine, Search, StopCircle, SendHorizonal, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import AIMessage from "@/components/AIMessage";
import { type AIChatMessage, useAIContext } from "@/context/AIContext";
import "@/styles/ai.css";

const AI_RESET_EVENT = "ai-chat-reset";
const AI_CANCEL_EVENT = "ai-chat-cancel";

type AIChatProps = {
  timeoutMs: number;
  aiEnabled: boolean;
  onCancelAISearchReady?: (cancelFn: () => void) => void;
  onStatusChange?: (status: AIChatStatus) => void;
};

export type AIChatStatus = "IDLE" | "SEARCHING" | "PROCESSING" | "TYPING";

const MAX_RETRIES = 6;
const RETRY_MS = 2500;

export default function AIChat({ timeoutMs, aiEnabled, onCancelAISearchReady, onStatusChange }: AIChatProps) {
  const {
    messages,
    setMessages,
    setIsThinking,
  } = useAIContext();

  const isLowSpecMode =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("low-spec");
  const maxMessages = 50;
  const typingDelayMs = isLowSpecMode ? 18 : 14;

  const [query, setQuery] = useState("");
  const [aiStatus, setAiStatus] = useState<AIChatStatus>("IDLE");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [slowNotice, setSlowNotice] = useState(false);
  const [gateNotice, setGateNotice] = useState<string | null>(null);

  const messagesRef = useRef<HTMLDivElement | null>(null);
  const requestControllerRef = useRef<AbortController | null>(null);
  const typingIntervalRef = useRef<number | null>(null);
  const retryTimersRef = useRef<number[]>([]);
  const slowNoticeTimerRef = useRef<number | null>(null);
  const sessionRef = useRef(0);
  const processingRef = useRef(false);
  const typingRef = useRef(false);

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
    typingRef.current = false;
    setIsTyping(false);
  }, []);

  const appendMessage = useCallback((msg: AIChatMessage) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      if (next.length <= maxMessages) return next;
      return next.slice(next.length - maxMessages);
    });
  }, [maxMessages, setMessages]);

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
    setStreamingText("");
    setSlowNotice(false);
    processingRef.current = false;
    setIsProcessing(false);
    setIsThinking(false);
    setAiStatus("IDLE");
  }, [clearRetryTimers, clearSlowNoticeTimer, setIsThinking, stopTyping]);

  const resetSession = useCallback(() => {
    cancelAISearch(true);
    setMessages([]);
    setGateNotice(null);
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
    if (!current) return;
    current.scrollTop = current.scrollHeight;
  }, [messages, streamingText, aiStatus]);

  const startTyping = useCallback((text: string, sessionId: number) => {
    stopTyping();
    typingRef.current = true;
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
        if (sessionId !== sessionRef.current) return;
        setStreamingText("");
        appendMessage({
          role: "assistant",
          content: text,
          timestamp: new Date().toISOString(),
        });
        processingRef.current = false;
        setIsProcessing(false);
        setIsThinking(false);
        setAiStatus("IDLE");
        setSlowNotice(false);
        clearSlowNoticeTimer();
      }
    }, typingDelayMs);
  }, [appendMessage, clearSlowNoticeTimer, setIsThinking, stopTyping, typingDelayMs]);

  const startSlowNoticeWatch = useCallback((sessionId: number) => {
    clearSlowNoticeTimer();
    slowNoticeTimerRef.current = window.setTimeout(() => {
      if (sessionId !== sessionRef.current) return;
      if (!processingRef.current) return;
      setSlowNotice(true);
    }, 1500);
  }, [clearSlowNoticeTimer]);

  const executeSearch = useCallback(async (text: string, sessionId: number, retryCount = 0) => {
    if (sessionId !== sessionRef.current) return;

    if (requestControllerRef.current) {
      requestControllerRef.current.abort();
    }
    const controller = new AbortController();
    requestControllerRef.current = controller;
    let waitingRetry = false;
    let startedTyping = false;

    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch("/api/ai/search", {
        method: "POST",
        headers,
        body: JSON.stringify({ query: text }),
        credentials: "include",
        signal: controller.signal,
      });
      window.clearTimeout(timeoutId);

      if (sessionId !== sessionRef.current) return;

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
      if (sessionId !== sessionRef.current) return;

      if (gateWaitMs > 0) {
        setGateNotice(`AI request queued for ${Math.max(1, Math.round(gateWaitMs / 1000))}s due to current traffic.`);
      }

      if (data?.processing) {
        setAiStatus("PROCESSING");
        if (retryCount >= MAX_RETRIES) {
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
          void executeSearch(text, sessionId, retryCount + 1);
        }, RETRY_MS + retryCount * 500);
        retryTimersRef.current.push(timerId);
        return;
      }

      const outputText = String(data?.ai_explanation || "Tiada cadangan AI.");
      startedTyping = true;
      startTyping(outputText, sessionId);
    } catch (error: unknown) {
      const err = error as { name?: string; message?: string };
      if (err?.name === "AbortError") {
        return;
      }
      if (sessionId !== sessionRef.current) {
        return;
      }
      appendMessage({
        role: "assistant",
        content: "AI tidak dapat memproses permintaan sekarang.\nSila cuba semula.",
        timestamp: new Date().toISOString(),
      });
      processingRef.current = false;
      setIsProcessing(false);
      setIsThinking(false);
      setAiStatus("IDLE");
      setSlowNotice(false);
      clearSlowNoticeTimer();
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null;
      }
      if (!waitingRetry && !startedTyping && sessionId === sessionRef.current) {
        processingRef.current = false;
        setIsProcessing(false);
        setIsThinking(false);
        setAiStatus("IDLE");
        setSlowNotice(false);
        clearSlowNoticeTimer();
      }
    }
  }, [appendMessage, clearSlowNoticeTimer, setIsThinking, startTyping, timeoutMs]);

  const handleSend = useCallback(async () => {
    if (!aiEnabled) return;
    const trimmed = query.trim();
    if (!trimmed) return;
    if (processingRef.current) return;

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
    startSlowNoticeWatch(sessionId);
    await executeSearch(trimmed, sessionId, 0);
  }, [aiEnabled, appendMessage, cancelAISearch, executeSearch, query, setIsThinking, startSlowNoticeWatch]);

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

  const statusMeta = useMemo(() => {
    if (aiStatus === "SEARCHING") {
      return {
        icon: Search,
        text: "AI sedang mencari maklumat...",
      };
    }
    if (aiStatus === "PROCESSING") {
      return {
        icon: Brain,
        text: "AI sedang memproses data...",
      };
    }
    if (aiStatus === "TYPING") {
      return {
        icon: PencilLine,
        text: "AI sedang menaip jawapan...",
      };
    }
    return {
      icon: Search,
      text: "AI idle.",
    };
  }, [aiStatus]);

  return (
    <div className="ai-chat-container">
      <div className="ai-status-bar">
        <statusMeta.icon className="ai-status-icon" />
        <span>{statusMeta.text}</span>
      </div>

      {slowNotice ? (
        <div className="ai-notice">
          <p className="ai-notice-title">Sistem sedang memproses data.</p>
          <p>Ini mungkin mengambil masa sedikit pada komputer spesifikasi rendah.</p>
        </div>
      ) : null}
      {gateNotice ? (
        <div className="ai-notice">{gateNotice}</div>
      ) : null}

      <div ref={messagesRef} className="ai-messages">
        {messages.length === 0 ? (
          <div className="ai-empty-hint">
            Taip soalan seperti IC, nombor akaun, atau nama untuk bantuan pantas.
          </div>
        ) : null}

        {messages.map((msg, idx) => (
          <AIMessage
            key={`${msg.timestamp}-${idx}`}
            role={msg.role}
            content={msg.content}
          />
        ))}

        {(aiStatus === "SEARCHING" || aiStatus === "PROCESSING") ? (
          <div className="ai-message-row ai-message-row-assistant">
            <div className="ai-bubble ai-bubble-assistant ai-typing-bubble">
              <Loader2 className="ai-typing-spinner" />
              <span className="ai-typing-label">AI sedang menaip...</span>
              <span className="ai-typing-dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        ) : null}

        {isTyping && streamingText ? (
          <AIMessage role="assistant" content={streamingText} />
        ) : null}
      </div>

      <div className="ai-input-container">
        <Textarea
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Taip soalan anda..."
          className="ai-input"
          rows={2}
          disabled={!aiEnabled || isProcessing}
        />
        <Button
          type="button"
          onClick={handleSend}
          className="ai-send-btn"
          disabled={!aiEnabled || isProcessing || !query.trim()}
          aria-label="Send AI query"
        >
          <SendHorizonal className="h-4 w-4" />
        </Button>
      </div>

      <div className="ai-actions">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="ai-stop-btn"
          onClick={() => cancelAISearch(true)}
          disabled={!isProcessing && !isTyping}
        >
          <StopCircle className="h-4 w-4" />
          <span>Stop AI</span>
        </Button>
      </div>

      {!aiEnabled ? (
        <div className="ai-notice ai-notice-error">
          <TriangleAlert className="h-4 w-4" />
          <span>AI assistant is disabled by system settings.</span>
        </div>
      ) : null}
    </div>
  );
}
