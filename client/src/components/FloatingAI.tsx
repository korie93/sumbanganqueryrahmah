import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Minimize2 } from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useMobileKeyboardState } from "@/hooks/use-mobile-keyboard-state";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AIChatStatus } from "@/components/AIChat";
import {
  areFloatingAiLayoutsEqual,
  resolveFloatingAiLayout,
  type RectLike,
} from "@/components/floating-ai-layout";
import { resolveFloatingAIMinimizedStatus } from "@/components/floating-ai-status";
import { useAIContext } from "@/context/AIContext";
import { cn } from "@/lib/utils";
import styles from "./FloatingAI.module.css";

const AI_RESET_EVENT = "ai-chat-reset";
const AIChat = lazy(() => import("@/components/AIChat"));
const AVOID_SELECTOR = "[data-floating-ai-avoid='true']";
const DIALOG_SELECTOR = "[role='dialog'], [data-radix-dialog-content]";
const DENSE_PAGE_HINTS = [
  "analysis",
  "audit",
  "backup",
  "collection",
  "dashboard",
  "general-search",
  "monitor",
  "saved",
  "search",
  "settings",
  "viewer",
] as const;

function isVisibleElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden";
}

function isEditableElement(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  const tagName = element.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT";
}

type FloatingAIProps = {
  timeoutMs: number;
  aiEnabled: boolean;
  activePage: string;
};

export default function FloatingAI({ timeoutMs, aiEnabled, activePage }: FloatingAIProps) {
  const isMobile = useIsMobile();
  const keyboardOpen = useMobileKeyboardState();
  const [isOpen, setIsOpen] = useState(false);
  const [hasActivated, setHasActivated] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIChatStatus>("IDLE");
  const [hasFocusedEditable, setHasFocusedEditable] = useState(false);
  const [layoutState, setLayoutState] = useState(() =>
    resolveFloatingAiLayout({
      viewportWidth: 1280,
      viewportHeight: 720,
      isMobile: false,
      isOpen: false,
      hasBlockingDialog: false,
      keyboardOpen: false,
      hasFocusedEditable: false,
      hasDensePage: false,
      avoidRects: [],
    }),
  );
  const [location] = useLocation();
  const floatingRootRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    const node = floatingRootRef.current;
    if (!node) return;
    node.style.setProperty("--floating-ai-trigger-bottom", `${layoutState.trigger.bottom}px`);
    node.style.setProperty(
      "--floating-ai-trigger-left",
      layoutState.trigger.left === null ? "auto" : `${layoutState.trigger.left}px`,
    );
    node.style.setProperty(
      "--floating-ai-trigger-right",
      layoutState.trigger.right === null ? "auto" : `${layoutState.trigger.right}px`,
    );
    node.style.setProperty("--floating-ai-panel-bottom", `${layoutState.panel.bottom}px`);
    node.style.setProperty(
      "--floating-ai-panel-left",
      layoutState.panel.left === null ? "auto" : `${layoutState.panel.left}px`,
    );
    node.style.setProperty(
      "--floating-ai-panel-right",
      layoutState.panel.right === null ? "auto" : `${layoutState.panel.right}px`,
    );
    node.style.setProperty("--floating-ai-panel-width", `${layoutState.panel.width}px`);
    node.style.setProperty("--floating-ai-panel-height", `${layoutState.panel.height}px`);
  }, [layoutState]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const updateFocusedEditable = () => {
      const activeElement = document.activeElement;
      const isInsideFloatingAi = Boolean(
        activeElement instanceof Node && floatingRootRef.current?.contains(activeElement),
      );
      setHasFocusedEditable(!isInsideFloatingAi && isEditableElement(activeElement));
    };

    updateFocusedEditable();
    document.addEventListener("focusin", updateFocusedEditable);
    document.addEventListener("focusout", updateFocusedEditable);

    return () => {
      document.removeEventListener("focusin", updateFocusedEditable);
      document.removeEventListener("focusout", updateFocusedEditable);
    };
  }, []);

  useEffect(() => {
    if (!isMobile || !isOpen || !hasFocusedEditable) return;
    setIsOpen(false);
  }, [hasFocusedEditable, isMobile, isOpen]);

  useEffect(() => {
    if (!isOpen || !layoutState.shouldAutoMinimize) return;
    setIsOpen(false);
  }, [isOpen, layoutState.shouldAutoMinimize]);

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
  const hideForFocusedEditable = isMobile && (hasFocusedEditable || keyboardOpen);
  const hasDensePage = useMemo(() => {
    const pageKey = `${activePage}:${location}`.toLowerCase();
    return DENSE_PAGE_HINTS.some((token) => pageKey.includes(token));
  }, [activePage, location]);

  const syncLayout = useCallback(() => {
    if (typeof window === "undefined") return;

    const avoidRects: RectLike[] = Array.from(document.querySelectorAll(AVOID_SELECTOR))
      .filter((element) => isVisibleElement(element))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      });

    const hasBlockingDialog = Array.from(document.querySelectorAll(DIALOG_SELECTOR)).some((element) =>
      isVisibleElement(element),
    );

    const nextLayout = resolveFloatingAiLayout({
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      isMobile,
      isOpen,
      hasBlockingDialog,
      keyboardOpen,
      hasFocusedEditable,
      hasDensePage,
      avoidRects,
    });

    setLayoutState((previous) => (areFloatingAiLayoutsEqual(previous, nextLayout) ? previous : nextLayout));
  }, [hasDensePage, hasFocusedEditable, isMobile, isOpen, keyboardOpen]);

  useEffect(() => {
    if (hiddenForAiPage || typeof window === "undefined") return;

    let frame = 0;
    let scheduled = false;
    const resizeObserver = new ResizeObserver(() => {
      scheduleSync();
    });
    const observedElements = new Set<Element>();

    const syncObservedElements = () => {
      const nextElements = new Set<Element>([
        ...document.querySelectorAll(AVOID_SELECTOR),
        ...document.querySelectorAll(DIALOG_SELECTOR),
      ]);

      for (const element of observedElements) {
        if (nextElements.has(element)) continue;
        resizeObserver.unobserve(element);
        observedElements.delete(element);
      }

      for (const element of nextElements) {
        if (observedElements.has(element)) continue;
        if (!(element instanceof Element)) continue;
        resizeObserver.observe(element);
        observedElements.add(element);
      }
    };

    const scheduleSync = () => {
      if (scheduled) return;
      scheduled = true;
      frame = window.requestAnimationFrame(() => {
        scheduled = false;
        syncObservedElements();
        syncLayout();
      });
    };

    scheduleSync();

    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "data-state", "hidden", "open"],
    });

    window.addEventListener("resize", scheduleSync, { passive: true });
    window.addEventListener("scroll", scheduleSync, { passive: true });

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("scroll", scheduleSync);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [hiddenForAiPage, location, syncLayout]);

  const minimizedStatus = resolveFloatingAIMinimizedStatus(aiStatus);

  if (hiddenForAiPage) return null;

  return (
    <div
      ref={floatingRootRef}
      className={cn(
        "pointer-events-none fixed transition-opacity duration-200",
        styles.floatingRoot,
        layoutState.rootHidden || (hideForFocusedEditable && !isOpen)
          ? "translate-y-2 opacity-0"
          : "opacity-100",
      )}
      aria-hidden={layoutState.rootHidden}
      hidden={layoutState.rootHidden}
    >
      {hasActivated ? (
        <div
          className={cn(
            "pointer-events-none absolute transition-all duration-200",
            styles.floatingPanelShell,
            isOpen && !layoutState.rootHidden
              ? "translate-y-0 opacity-100"
              : "pointer-events-none translate-y-2 opacity-0",
          )}
          aria-hidden={!isOpen}
        >
          <section
            className={cn(
              "pointer-events-auto h-full w-full border border-border bg-card text-card-foreground shadow-xl",
              layoutState.panel.mode === "sheet"
                ? "rounded-[24px] border-border/90 shadow-2xl"
                : "rounded-[18px]",
            )}
            aria-label="AI SQR Popup"
            data-floating-ai-panel-mode={layoutState.panel.mode}
          >
            <header
              className={cn(
                "flex items-center justify-between border-b border-border",
                isMobile ? "min-h-14 px-3.5" : "h-14 px-4",
              )}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">AI SQR</p>
                <p className="truncate text-[11px] text-muted-foreground">Smart Query Engine</p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn("text-xs", isMobile ? "h-9 px-2.5" : "h-8 px-2")}
                  onClick={handleReset}
                  disabled={messages.length === 0 && !isThinking}
                >
                  Reset Sesi
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={cn(isMobile ? "h-9 w-9" : "h-8 w-8")}
                  onClick={handleMinimize}
                  aria-label="Minimize AI panel"
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
              </div>
            </header>
            <div className={cn("h-[calc(100%-56px)]", isMobile ? "p-2.5" : "p-3")}>
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
      <div
        className={cn(
          "absolute flex flex-col gap-2 pointer-events-none",
          styles.floatingTriggerShell,
          layoutState.trigger.anchor === "left" ? "items-start" : "items-end",
          layoutState.triggerHidden ? "translate-y-2 opacity-0" : "opacity-100",
        )}
        aria-hidden={layoutState.triggerHidden}
      >
        {!isOpen && isThinking && !layoutState.rootHidden && !isMobile ? (
          <div className="pointer-events-none max-w-[220px] rounded-lg border border-blue-500/35 bg-blue-500/10 px-3 py-1.5 text-[11px] text-blue-200 shadow-sm">
            {minimizedStatus}
          </div>
        ) : null}
        <button
          type="button"
          onClick={handleToggle}
          title="AI SQR"
          className={cn(
            "pointer-events-auto relative flex items-center justify-center rounded-full border border-border/50 bg-background/95 text-foreground shadow-lg backdrop-blur-sm transition-transform hover:scale-[1.03]",
            isMobile ? "h-12 w-12" : "h-14 w-14",
            hideForFocusedEditable ? "pointer-events-none" : "",
            layoutState.triggerHidden ? "pointer-events-none scale-95 opacity-0" : "",
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
      </div>
    </div>
  );
}
