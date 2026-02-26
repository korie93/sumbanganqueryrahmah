import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { type AIChatMessage, useAIContext } from "@/context/AIContext";

type AIProps = {
  timeoutMs?: number;
  aiEnabled?: boolean;
  embedded?: boolean;
  showResetButton?: boolean;
};

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
  const { messages, isThinking, setIsThinking, setMessages, resetSession } = useAIContext();

  const [query, setQuery] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const retryMs = 2500;
  const maxRetries = 6;
  const isMountedRef = useRef(true);
  const retryTimersRef = useRef<number[]>([]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      retryTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      retryTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: isLowSpecMode ? "auto" : "smooth" });
  }, [isLowSpecMode, messages, isThinking]);

  const appendMessage = useCallback((msg: AIChatMessage) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      if (next.length <= MAX_CHAT_MESSAGES) return next;
      return next.slice(next.length - MAX_CHAT_MESSAGES);
    });
  }, [MAX_CHAT_MESSAGES, setMessages]);

  const sendQuery = useCallback(async (text: string, isRetry = false, retryCount = 0) => {
    if (!text || (isThinking && !isRetry)) return;

    if (!isRetry) {
      const userMessage: AIChatMessage = {
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };
      appendMessage(userMessage);
      setIsThinking(true);
    }
    let keepThinking = false;

    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers.Authorization = `Bearer ${token}`;
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers,
        body: JSON.stringify({ query: text }),
        credentials: "include",
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      if (!res.ok) {
        const responseText = (await res.text()) || res.statusText;
        throw new Error(responseText);
      }
      const data = await res.json();
      if (data?.processing) {
        if (retryCount >= maxRetries) {
          appendMessage({
            role: "assistant",
            content: "Sistem masih memproses. Sila klik Send sekali lagi selepas beberapa saat.",
            timestamp: new Date().toISOString(),
          });
          return;
        }
        keepThinking = true;
        if (!isRetry) {
          appendMessage({
            role: "assistant",
            content: data?.ai_explanation || "Sedang proses carian. Sila tunggu beberapa saat.",
            timestamp: new Date().toISOString(),
          });
        }
        const timerId = window.setTimeout(() => {
          void sendQuery(text, true, retryCount + 1);
        }, retryMs + retryCount * 500);
        retryTimersRef.current.push(timerId);
        return;
      }
      appendMessage({
        role: "assistant",
        content: data?.ai_explanation || "Tiada cadangan AI.",
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const error = err as { name?: string; message?: string };
      const isAbort = error?.name === "AbortError";
      if (isAbort && isRetry) {
        if (retryCount >= maxRetries) {
          appendMessage({
            role: "assistant",
            content: "Permintaan mengambil masa terlalu lama. Sila cuba semula.",
            timestamp: new Date().toISOString(),
          });
          return;
        }
        keepThinking = true;
        const timerId = window.setTimeout(() => {
          void sendQuery(text, true, retryCount + 1);
        }, retryMs + retryCount * 500);
        retryTimersRef.current.push(timerId);
        return;
      }
      appendMessage({
        role: "assistant",
        content: isAbort
          ? `Maaf, AI mengambil masa terlalu lama (timeout ${timeoutMs / 1000}s). Sila cuba soalan lebih ringkas.`
          : error?.message || "Ralat semasa memproses carian.",
        timestamp: new Date().toISOString(),
      });
    } finally {
      if (!keepThinking && isMountedRef.current) {
        setIsThinking(false);
      }
    }
  }, [appendMessage, isThinking, setIsThinking, timeoutMs]);

  const handleSend = useCallback(async () => {
    if (!aiEnabled) return;
    const trimmed = query.trim();
    if (!trimmed || isThinking) return;
    setQuery("");
    await sendQuery(trimmed);
  }, [aiEnabled, isThinking, query, sendQuery]);

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
        {showResetButton ? (
          <div className="flex items-center justify-end">
            <Button
              variant="outline"
              onClick={resetSession}
              disabled={messages.length === 0}
            >
              New Chat
            </Button>
          </div>
        ) : null}

        <div className={`${chatHeightClass} overflow-y-auto space-y-3 pr-2`}>
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
          {isThinking ? (
            <div className="mr-auto max-w-[70%] rounded-2xl bg-muted px-4 py-3 text-sm text-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/70" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/70 [animation-delay:150ms]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-foreground/70 [animation-delay:300ms]" />
                <span className="ml-2">AI sedang menaip...</span>
              </span>
            </div>
          ) : null}
          <div ref={messagesEndRef} />
        </div>

        <div className="flex items-end gap-2">
          <Textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Taip soalan anda..."
            rows={2}
            disabled={!aiEnabled || isThinking}
            className={embedded ? "min-h-[72px]" : ""}
          />
          <Button onClick={handleSend} disabled={!aiEnabled || isThinking}>
            {isThinking ? "Memproses..." : "Send"}
          </Button>
        </div>
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
