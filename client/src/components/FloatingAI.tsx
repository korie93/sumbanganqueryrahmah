import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Minimize2 } from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AIChatStatus } from "@/components/AIChat";
import { useAIContext } from "@/context/AIContext";
import { cn } from "@/lib/utils";
import styles from "./FloatingAI.module.css";

const AI_RESET_EVENT = "ai-chat-reset";
const AIChat = lazy(() => import("@/components/AIChat"));
const AVOID_SELECTOR = "[data-floating-ai-avoid='true']";
const DIALOG_SELECTOR = "[role='dialog'], [data-radix-dialog-content]";

function isVisibleElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

type FloatingAIProps = {
  timeoutMs: number;
  aiEnabled: boolean;
  activePage: string;
};

export default function FloatingAI({ timeoutMs, aiEnabled, activePage }: FloatingAIProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hasActivated, setHasActivated] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIChatStatus>("IDLE");
  const [safePosition, setSafePosition] = useState({
    bottom: 24,
    right: 24,
    hasBlockingDialog: false,
  });
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
    () => messages.reduce((count, message) => (message.role === "assistant" ? count + 1 : count), 0),
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
    const previousAssistantCount = lastAssistantCountRef.current;
    if (assistantCount > previousAssistantCount && !isOpen) {
      setUnreadCount((previous) => previous + (assistantCount - previousAssistantCount));
    }
    lastAssistantCountRef.current = assistantCount;
  }, [assistantCount, isOpen, setUnreadCount]);

  const handleMinimize = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleToggle = useCallback(() => {
    setHasActivated(true);
    setIsOpen((previous) => !previous);
  }, []);

  const handleReset = useCallback(() => {
    cancelAISearchRef.current?.();
    window.dispatchEvent(new Event(AI_RESET_EVENT));
    resetSession();
  }, [resetSession]);

  const hiddenForAiPage = activePage === "ai" || location.toLowerCase() === "/ai";
  const syncSafePosition = useCallback(() => {
    if (typeof window === "undefined") return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const compactViewport = viewportWidth < 640;
    const baseRight = compactViewport ? 16 : 24;
    const baseBottom = compactViewport ? 16 : 24;
    const overlayWidth = isOpen
      ? Math.max(56, Math.min(380, viewportWidth - (compactViewport ? 24 : 48)))
      : 56;
    const rightBoundary = viewportWidth - overlayWidth - baseRight - 8;
    let requiredBottom = baseBottom;

    document.querySelectorAll(AVOID_SELECTOR).forEach((element) => {
      if (!isVisibleElement(element)) return;
      const rect = element.getBoundingClientRect();
      const nearViewportBottom = rect.bottom > viewportHeight - 220;
      const overlapsAiColumn = rect.right > rightBoundary;
      if (!nearViewportBottom || !overlapsAiColumn) return;
      requiredBottom = Math.max(
        requiredBottom,
        Math.max(baseBottom, viewportHeight - rect.top + 12),
      );
    });

    const hasBlockingDialog = Array.from(document.querySelectorAll(DIALOG_SELECTOR)).some((element) =>
      isVisibleElement(element),
    );

    const nextPosition = {
      bottom: Math.min(requiredBottom, Math.max(baseBottom, viewportHeight - 96)),
      right: baseRight,
      hasBlockingDialog,
    };

    setSafePosition((previous) =>
      previous.bottom === nextPosition.bottom &&
      previous.right === nextPosition.right &&
      previous.hasBlockingDialog === nextPosition.hasBlockingDialog
        ? previous
        : nextPosition,
    );
  }, [isOpen]);

  useEffect(() => {
    if (hiddenForAiPage || typeof window === "undefined") return;

    let frame = 0;
    let scheduled = false;
    const scheduleSync = () => {
      if (scheduled) return;
      scheduled = true;
      frame = window.requestAnimationFrame(() => {
        scheduled = false;
        syncSafePosition();
      });
    };

    scheduleSync();

    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-state", "aria-hidden", "open"],
    });

    window.addEventListener("resize", scheduleSync, { passive: true });
    window.addEventListener("scroll", scheduleSync, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("scroll", scheduleSync);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [hiddenForAiPage, location, syncSafePosition]);

  if (hiddenForAiPage) return null;

  const minimizedStatus = useMemo(() => {
    if (aiStatus === "SEARCHING") return "AI sedang mencari maklumat...";
    if (aiStatus === "PROCESSING") return "AI sedang memproses data...";
    if (aiStatus === "TYPING") return "AI sedang menaip jawapan...";
    return "AI sedang memproses...";
  }, [aiStatus]);

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-[9999] flex flex-col items-end gap-3 transition-[bottom,right,opacity,transform] duration-200",
        safePosition.hasBlockingDialog ? "opacity-0 translate-y-2" : "opacity-100",
      )}
      style={{ bottom: safePosition.bottom, right: safePosition.right }}
      aria-hidden={safePosition.hasBlockingDialog}
      hidden={safePosition.hasBlockingDialog}
    >
      {hasActivated ? (
        <div
          className={cn(
            "pointer-events-auto transition-all duration-200",
            isOpen && !safePosition.hasBlockingDialog
              ? "translate-y-0 opacity-100"
              : "pointer-events-none translate-y-2 opacity-0",
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
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                  </div>
                }
              >
                <AIChat
                  timeoutMs={timeoutMs}
                  aiEnabled={aiEnabled}
                  onStatusChange={setAiStatus}
                  onCancelAISearchReady={(cancelFn) => {
                    cancelAISearchRef.current = cancelFn;
                  }}
                />
              </Suspense>
            </div>
          </section>
        </div>
      ) : null}

      <button
        type="button"
        onClick={handleToggle}
        title="AI SQR"
        className={cn(
          "pointer-events-auto relative flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-[1.03]",
          safePosition.hasBlockingDialog ? "pointer-events-none scale-95" : "",
          !isOpen && isThinking ? styles.aiThinkingRing : "",
        )}
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
      {!isOpen && isThinking && !safePosition.hasBlockingDialog ? (
        <div className="pointer-events-none max-w-[220px] rounded-lg border border-blue-500/35 bg-blue-500/10 px-3 py-1.5 text-[11px] text-blue-200 shadow-sm">
          {minimizedStatus}
        </div>
      ) : null}
    </div>
  );
}
