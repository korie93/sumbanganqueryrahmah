import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Minimize2 } from "lucide-react";
import { useLocation } from "wouter";
import AI from "@/pages/AI";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAIContext } from "@/context/AIContext";
import { cn } from "@/lib/utils";
import styles from "./FloatingAI.module.css";

type FloatingAIProps = {
  timeoutMs: number;
  aiEnabled: boolean;
  activePage: string;
};

export default function FloatingAI({ timeoutMs, aiEnabled, activePage }: FloatingAIProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [location] = useLocation();
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

  const hiddenForAiPage = activePage === "ai" || location.toLowerCase() === "/ai";
  if (hiddenForAiPage) return null;

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
                onClick={resetSession}
                disabled={messages.length === 0}
              >
                Reset Sesi
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                onClick={() => setIsOpen(false)}
                aria-label="Minimize AI panel"
              >
                <Minimize2 className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <div className="h-[calc(100%-56px)] p-3">
            <AI
              timeoutMs={timeoutMs}
              aiEnabled={aiEnabled}
              embedded
              showResetButton={false}
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
    </div>
  );
}
