import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Minimize2 } from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import AIChat, { type AIChatStatus } from "@/components/AIChat";
import { useAIContext } from "@/context/AIContext";
import { cn } from "@/lib/utils";
import styles from "./FloatingAI.module.css";

const AI_RESET_EVENT = "ai-chat-reset";

type FloatingAIProps = {
  timeoutMs: number;
  aiEnabled: boolean;
  activePage: string;
};

export default function FloatingAI({ timeoutMs, aiEnabled, activePage }: FloatingAIProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIChatStatus>("IDLE");
  const [location] = useLocation();
  const cancelAISearchRef = useRef<(() => void) | null>(null);
  const {
    messages,
    isThinking,
    unreadCount,
    setUnreadCount,
    resetSession,
  } = useAIContext();
  const assistantCount = useMemo(
    () => messages.reduce((count, msg) => (msg.role === "assistant" ? count + 1 : count), 0),
    [messages],
  );
  const lastAssistantCountRef = useRef(assistantCount);

  useEffect(() => {
    setIsOpen(false);
  }, [activePage, location]);

  useEffect(() => {
    if (isOpen && unreadCount !== 0) {
      setUnreadCount(0);
    }
  }, [isOpen, setUnreadCount, unreadCount]);

  useEffect(() => {
    const prevAssistantCount = lastAssistantCountRef.current;
    if (assistantCount > prevAssistantCount && !isOpen) {
      const delta = assistantCount - prevAssistantCount;
      setUnreadCount((prev) => prev + delta);
    }
    lastAssistantCountRef.current = assistantCount;
  }, [assistantCount, isOpen, setUnreadCount]);

  const handleMinimize = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleReset = useCallback(() => {
    cancelAISearchRef.current?.();
    window.dispatchEvent(new Event(AI_RESET_EVENT));
    resetSession();
  }, [resetSession]);

  const hiddenForAiPage = activePage === "ai" || location.toLowerCase() === "/ai";
  if (hiddenForAiPage) return null;

  const minimizedStatus = useMemo(() => {
    if (aiStatus === "SEARCHING") return "AI sedang mencari maklumat...";
    if (aiStatus === "PROCESSING") return "AI sedang memproses data...";
    if (aiStatus === "TYPING") return "AI sedang menaip jawapan...";
    return "AI sedang memproses...";
  }, [aiStatus]);

  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[9999] flex flex-col items-end gap-3">
      <div
        className={cn(
          "pointer-events-auto transition-all duration-200",
          isOpen ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0",
        )}
      >
        <section
          className="h-[min(520px,calc(100vh-120px))] w-[min(380px,calc(100vw-48px))] rounded-[16px] border border-border bg-card text-card-foreground shadow-xl"
          aria-label="AI SQR Popup"
        >
          <header className="flex h-14 items-center justify-between border-b border-border px-4">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">AI SQR</p>
              <p className="truncate text-[11px] text-muted-foreground">Smart Query Engine</p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 px-2 text-xs"
                onClick={handleReset}
                disabled={messages.length === 0 && !isThinking}
              >
                Reset Sesi
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={handleMinimize}
                aria-label="Minimize AI panel"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <div className="h-[calc(100%-56px)] p-3">
            <AIChat
              timeoutMs={timeoutMs}
              aiEnabled={aiEnabled}
              onStatusChange={setAiStatus}
              onCancelAISearchReady={(cancelFn) => {
                cancelAISearchRef.current = cancelFn;
              }}
            />
          </div>
        </section>
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className={cn(
              "pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-[1.03]",
              !isOpen && isThinking ? styles.aiThinkingRing : "",
            )}
            style={{ bottom: 24, right: 24, zIndex: 9999 }}
            aria-label="AI SQR"
            data-testid="floating-ai-toggle"
          >
            <Bot className="h-6 w-6" />
            {!isOpen && unreadCount > 0 ? (
              <Badge
                className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full bg-destructive px-1 text-[10px] text-destructive-foreground"
                data-testid="floating-ai-unread-badge"
              >
                {unreadCount > 99 ? "99+" : unreadCount}
              </Badge>
            ) : null}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          <p>AI SQR — Klik untuk bantuan pintar</p>
        </TooltipContent>
      </Tooltip>
      {!isOpen && isThinking ? (
        <div className="pointer-events-none max-w-[220px] rounded-lg border border-blue-500/35 bg-blue-500/10 px-3 py-1.5 text-[11px] text-blue-200 shadow-sm">
          {minimizedStatus}
        </div>
      ) : null}
    </div>
  );
}
