import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Brain, PencilLine, Search, StopCircle, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { type AIChatMessage, useAIContext } from "@/context/AIContext";

type AIProps = {
  timeoutMs?: number;
  aiEnabled?: boolean;
  embedded?: boolean;
  showResetButton?: boolean;
};

type AIStatus = "IDLE" | "SEARCHING" | "PROCESSING" | "TYPING";

const AI_RESET_EVENT = "ai-chat-reset";
const AI_CANCEL_EVENT = "ai-chat-cancel";

export default function AI({
  timeoutMs = 20000,
  aiEnabled = true,
  embedded = false,
  showResetButton = true,
}: AIProps) {
  const isLowSpecMode =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("low-spec");
  const MAX_CHAT_MESSAGES = isLowSpecMode ? 60 : 200;
  const TYPING_INTERVAL_MS = isLowSpecMode ? 18 : 12;
  const { messages, isThinking, setIsThinking, setMessages, resetSession } = useAIContext();

  const [query, setQuery] = useState("");
  const [aiStatus, setAiStatus] = useState<AIStatus>("IDLE");
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
  const retryMs = 2500;
  const maxRetries = 6;
  const isMountedRef = useRef(true);
  const retryTimersRef = useRef<number[]>([]);

  const clearRetryTimers = useCallback(() => {
    retryTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    retryTimersRef.current = [];
  }, []);

  const clearSlowNoticeTimer = useCallback(() => {
    if (slowNoticeTimerRef.current) {
      window.clearTimeout(slowNoticeTimerRef.current);
      slowNoticeTimerRef.current = null;
    }
  }, []);

  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) {
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

  const startSlowNoticeWatch = useCallback((sessionId: number) => {
    clearSlowNoticeTimer();
    slowNoticeTimerRef.current = window.setTimeout(() => {
      if (!isMountedRef.current) return;
      if (sessionRef.current !== sessionId) return;
      if (!processingRef.current) return;
      setSlowNotice(true);
    }, 1500);
  }, [clearSlowNoticeTimer]);

  const appendMessage = useCallback((msg: AIChatMessage) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      if (next.length <= MAX_CHAT_MESSAGES) return next;
      return next.slice(next.length - MAX_CHAT_MESSAGES);
    });
  }, [MAX_CHAT_MESSAGES, setMessages]);

  const startTyping = useCallback((text: string, sessionId: number) => {
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
    }, TYPING_INTERVAL_MS);
  }, [TYPING_INTERVAL_MS, appendMessage, setIsThinking, stopProcessingState, stopTyping]);

  const sendQuery = useCallback(async (text: string, isRetry = false, retryCount = 0, activeSessionId?: number) => {
    if (!text) return;
    if (!isRetry && (processingRef.current || pendingSendRef.current)) return;

    const sessionId = isRetry ? (activeSessionId ?? sessionRef.current) : sessionRef.current + 1;

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
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers,
        body: JSON.stringify({ query: text }),
        credentials: "include",
        signal: controller.signal,
      });
      window.clearTimeout(timeout);

      if (sessionRef.current !== sessionId) return;

      const gateWaitMs = Number(res.headers.get("x-ai-gate-wait-ms") || "0");
      if (!res.ok) {
        let responseMessage = res.statusText || "AI request failed.";
        const contentType = String(res.headers.get("content-type") || "").toLowerCase();
        if (contentType.includes("application/json")) {
          const payload = await res.json();
          const gate = payload?.gate;
          if (typeof payload?.message === "string" && payload.message.trim()) {
            responseMessage = payload.message.trim();
          }
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
        } else {
          const responseText = (await res.text()).trim();
          if (responseText) responseMessage = responseText;
        }
        throw new Error(responseMessage);
      }
      const data = await res.json();
      if (sessionRef.current !== sessionId) return;

      if (!isRetry && gateWaitMs > 0) {
        setGateNotice(`AI request queued for ${Math.max(1, Math.round(gateWaitMs / 1000))}s due to current traffic.`);
      }
      if (data?.processing) {
        setAiStatus("PROCESSING");
        if (retryCount >= maxRetries) {
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
        }, retryMs + retryCount * 500);
        retryTimersRef.current.push(timerId);
        return;
      }
      startTyping(data?.ai_explanation || "Tiada cadangan AI.", sessionId);
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      const isAbort = error?.name === "AbortError";
      if (isAbort || sessionRef.current !== sessionId) {
        return;
      }
      appendMessage({
        role: "assistant",
        content: error?.message || "AI tidak dapat memproses permintaan sekarang.\nSila cuba semula.",
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
    }
  }, [
    abortActiveRequest,
    appendMessage,
    retryMs,
    setIsThinking,
    startSlowNoticeWatch,
    startTyping,
    stopProcessingState,
    timeoutMs,
  ]);

  const handleSend = useCallback(async () => {
    if (!aiEnabled) return;
    const trimmed = query.trim();
    if (!trimmed || processingRef.current || pendingSendRef.current) return;
    setQuery("");
    await sendQuery(trimmed);
  }, [aiEnabled, query, sendQuery]);

  const statusContent = useMemo(() => {
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

  const chatHeightClass = useMemo(
    () => (embedded ? "h-full max-h-[350px]" : "h-[60vh]"),
    [embedded],
  );

  const chatPanel = (
    <div className="rounded-2xl border border-border bg-background/70 p-4 backdrop-blur">
      <div className="space-y-4">
        {!aiEnabled ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            AI assistant is disabled by system settings.
          </div>
        ) : null}
        {aiEnabled ? (
          <div className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${statusContent.className}`}>
            <statusContent.icon className="h-3.5 w-3.5" />
            <span>{statusContent.text}</span>
          </div>
        ) : null}
        {aiEnabled && gateNotice ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            {gateNotice}
          </div>
        ) : null}
        {aiEnabled && slowNotice ? (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
            <p className="font-medium">Sistem sedang memproses data.</p>
            <p>Ini mungkin mengambil masa sedikit pada komputer spesifikasi rendah.</p>
          </div>
        ) : null}
        {showResetButton ? (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              onClick={cancelAI}
              disabled={!isProcessing && !isTyping}
            >
              <StopCircle className="mr-2 h-4 w-4" />
              Stop AI
            </Button>
            <Button
              variant="outline"
              onClick={resetChat}
              disabled={messages.length === 0 && !isProcessing && !isTyping}
            >
              New Chat
            </Button>
          </div>
        ) : null}

        <div ref={messagesContainerRef} className={`${chatHeightClass} overflow-y-auto space-y-3 pr-2`}>
          {messages.length === 0 ? (
            <div className="text-sm text-muted-foreground">
              Mula dengan soalan seperti: <span className="font-semibold">IC 840703115667</span> atau{" "}
              <span className="font-semibold">cawangan AEON terdekat</span>
            </div>
          ) : null}
          {messages.map((msg, idx) => (
            <div
              key={`${msg.timestamp}-${idx}`}
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm ${
                msg.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "mr-auto bg-muted text-foreground"
              }`}
            >
              {msg.content}
            </div>
          ))}
          {streamingText ? (
            <div
              key={`streaming-${streamingTimestamp}`}
              className="mr-auto max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-4 py-3 text-sm text-foreground"
            >
              {streamingText}
            </div>
          ) : null}
          {isThinking && !streamingText ? (
            <div className="mr-auto max-w-[70%] rounded-2xl bg-muted px-4 py-3 text-sm text-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/70" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/70 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/70 [animation-delay:300ms]" />
                <span className="ml-2">AI sedang menaip...</span>
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex items-end gap-2">
          <Textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Taip soalan anda..."
            rows={2}
            disabled={!aiEnabled || isProcessing}
            className={embedded ? "min-h-[72px]" : ""}
          />
          <Button onClick={handleSend} disabled={!aiEnabled || isProcessing}>
            {isProcessing ? "Memproses..." : "Send"}
          </Button>
        </div>
        {!showResetButton ? (
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={cancelAI}
              disabled={!isProcessing && !isTyping}
            >
              <StopCircle className="mr-2 h-4 w-4" />
              Stop AI
            </Button>
          </div>
        ) : null}
        {aiEnabled && aiStatus === "IDLE" && gateNotice === null && slowNotice === false ? (
          <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <p>Tip: untuk respon lebih cepat pada komputer lama, gunakan soalan ringkas dan spesifik.</p>
          </div>
        ) : null}
      </div>
    </div>
  );

  if (embedded) {
    return chatPanel;
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 p-6 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-foreground">AI Chat</h1>
          <p className="text-muted-foreground">
            Tanya biasa je tak power macam ChatGPT. Jangan tanya yang bukan-bukan.
          </p>
        </div>
        {chatPanel}
      </div>
    </div>
  );
}
