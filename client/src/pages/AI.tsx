import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

type AIProps = {
  timeoutMs?: number;
  aiEnabled?: boolean;
};

export default function AI({ timeoutMs = 20000, aiEnabled = true }: AIProps) {
  const isLowSpecMode =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("low-spec");
  const MAX_CHAT_MESSAGES = isLowSpecMode ? 60 : 200;
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const retryMs = 2500;
  const maxRetries = 6;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: isLowSpecMode ? "auto" : "smooth" });
  }, [messages]);

  const appendMessage = (msg: ChatMessage) => {
    setMessages((prev) => {
      const next = [...prev, msg];
      if (next.length <= MAX_CHAT_MESSAGES) return next;
      return next.slice(next.length - MAX_CHAT_MESSAGES);
    });
  };

  const sendQuery = async (text: string, isRetry = false, retryCount = 0) => {
    if (!text || (loading && !isRetry)) return;
    if (!isRetry) {
      const userMessage: ChatMessage = {
        role: "user",
        content: text,
        timestamp: new Date().toISOString(),
      };
      appendMessage(userMessage);
      setLoading(true);
    }
    let keepLoading = false;

    try {
      const token = localStorage.getItem("token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers,
        body: JSON.stringify({ query: text }),
        credentials: "include",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(text);
      }
      const data = await res.json();
      if (data?.processing) {
        if (retryCount >= maxRetries) {
          const aiMessage: ChatMessage = {
            role: "assistant",
            content: "Sistem masih memproses. Sila klik Send sekali lagi selepas beberapa saat.",
            timestamp: new Date().toISOString(),
          };
          appendMessage(aiMessage);
          return;
        }
        keepLoading = true;
        if (!isRetry) {
          const aiMessage: ChatMessage = {
            role: "assistant",
            content: data?.ai_explanation || "Sedang proses carian. Sila tunggu beberapa saat.",
            timestamp: new Date().toISOString(),
          };
          appendMessage(aiMessage);
        }
        setTimeout(() => {
          sendQuery(text, true, retryCount + 1);
        }, retryMs + retryCount * 500);
        return;
      }
      const aiMessage: ChatMessage = {
        role: "assistant",
        content: data?.ai_explanation || "Tiada cadangan AI.",
        timestamp: new Date().toISOString(),
      };
      appendMessage(aiMessage);
    } catch (err: any) {
      const isAbort = err?.name === "AbortError";
      if (isAbort && isRetry) {
        if (retryCount >= maxRetries) {
          const aiMessage: ChatMessage = {
            role: "assistant",
            content: "Permintaan mengambil masa terlalu lama. Sila cuba semula.",
            timestamp: new Date().toISOString(),
          };
          appendMessage(aiMessage);
          return;
        }
        keepLoading = true;
        setTimeout(() => {
          sendQuery(text, true, retryCount + 1);
        }, retryMs + retryCount * 500);
        return;
      }
      const aiMessage: ChatMessage = {
        role: "assistant",
        content: isAbort
          ? `Maaf, AI mengambil masa terlalu lama (timeout ${timeoutMs / 1000}s). Sila cuba soalan lebih ringkas.`
          : err?.message || "Ralat semasa memproses carian.",
        timestamp: new Date().toISOString(),
      };
      appendMessage(aiMessage);
    } finally {
      if (!keepLoading) setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!aiEnabled) return;
    const trimmed = query.trim();
    if (!trimmed || loading) return;
    setQuery("");
    await sendQuery(trimmed);
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-gradient-to-br from-slate-100 via-blue-50 to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 p-6">
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold text-foreground">AI Chat</h1>
          <p className="text-muted-foreground">
            Tanya biasa je tak power macam ChatGPT. Jangan tanya yang bukan-bukan.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-background/70 backdrop-blur p-4 space-y-4">
          {!aiEnabled && (
            <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
              AI assistant is disabled by system settings.
            </div>
          )}
          <div className="flex items-center justify-end">
            <Button
              variant="outline"
              onClick={() => setMessages([])}
              disabled={messages.length === 0}
            >
              New Chat
            </Button>
          </div>

          <div className="h-[60vh] overflow-y-auto space-y-3 pr-2">
            {messages.length === 0 && (
              <div className="text-sm text-muted-foreground">
                Mula dengan soalan seperti: <span className="font-semibold">IC 840703115667</span> atau{" "}
                <span className="font-semibold">cawangan AEON terdekat</span>
              </div>
            )}
            {messages.map((msg, idx) => (
              <div
                key={`${msg.timestamp}-${idx}`}
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground"
                    : "mr-auto bg-muted text-foreground"
                }`}
              >
                {msg.content}
              </div>
            ))}
            {loading && (
              <div className="mr-auto max-w-[70%] rounded-2xl px-4 py-3 text-sm bg-muted text-foreground">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-foreground/70 animate-bounce" />
                  <span className="h-2 w-2 rounded-full bg-foreground/70 animate-bounce [animation-delay:150ms]" />
                  <span className="h-2 w-2 rounded-full bg-foreground/70 animate-bounce [animation-delay:300ms]" />
                  <span className="ml-2">AI sedang menaip...</span>
                </span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="flex items-end gap-2">
            <Textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Taip soalan anda..."
              rows={2}
              disabled={!aiEnabled || loading}
            />
            <Button onClick={handleSend} disabled={!aiEnabled || loading}>
              {loading ? "Memproses..." : "Send"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
