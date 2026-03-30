import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bot, Minimize2 } from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { useMobileViewportState } from "@/hooks/use-mobile-viewport-state";
import type { AIChatStatus } from "@/components/AIChat";
import {
  areFloatingAiLayoutsEqual,
  resolveFloatingAiLayout,
  type RectLike,
} from "@/components/floating-ai-layout";
import { applyFloatingAiScrollLock } from "@/components/floating-ai-scroll-lock";
import { resolveFloatingAIMinimizedStatus } from "@/components/floating-ai-status";
import {
  shouldKeepFloatingAiPanelMounted,
  shouldTrackFloatingAiDom,
} from "@/components/floating-ai-visibility";
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
  const {
    keyboardOpen,
    bottomInset: viewportBottomInset,
    viewportHeight: mobileViewportHeight,
  } = useMobileViewportState();
  const [isOpen, setIsOpen] = useState(false);
  const [hasActivated, setHasActivated] = useState(false);
  const [aiStatus, setAiStatus] = useState<AIChatStatus>("IDLE");
  const [hasFocusedEditable, setHasFocusedEditable] = useState(false);
  const [hasFocusedAiEditable, setHasFocusedAiEditable] = useState(false);
  const [layoutState, setLayoutState] = useState(() =>
    resolveFloatingAiLayout({
      viewportWidth: 1280,
      viewportHeight: 720,
      viewportBottomInset: 0,
      isMobile: false,
      isOpen: false,
      hasBlockingDialog: false,
      keyboardOpen: false,
      hasFocusedEditable: false,
      hasDensePage: false,
      preferCompactPanel: false,
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
      const nextIsEditable = isEditableElement(activeElement);
      setHasFocusedEditable(!isInsideFloatingAi && nextIsEditable);
      setHasFocusedAiEditable(isInsideFloatingAi && nextIsEditable);
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

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!isMobile || !isOpen || layoutState.rootHidden) return;

    return applyFloatingAiScrollLock({
      bodyStyle: document.body.style,
      documentElementStyle: document.documentElement.style,
      windowObject: window,
    });
  }, [isMobile, isOpen, layoutState.rootHidden]);

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
  const hideForFocusedEditable = isMobile && hasFocusedEditable;
  const shouldKeepPanelMounted = shouldKeepFloatingAiPanelMounted({
    hasActivated,
    isOpen,
    isThinking,
    aiStatus,
  });
  const shouldShowPanel = shouldKeepPanelMounted && isOpen && !layoutState.rootHidden;
  const shouldTrackDomAggressively = shouldTrackFloatingAiDom({
    isOpen,
    isThinking,
    aiStatus,
  });
  const preferCompactPanel =
    isMobile &&
    (
      (messages.length === 0 && !isThinking && aiStatus === "IDLE") ||
      hasFocusedAiEditable
    );
  const hasDensePage = useMemo(() => {
    const pageKey = `${activePage}:${location}`.toLowerCase();
    return DENSE_PAGE_HINTS.some((token) => pageKey.includes(token));
  }, [activePage, location]);

  const syncLayout = useCallback(() => {
    if (typeof window === "undefined") return;
    const effectiveViewportHeight =
      isMobile && mobileViewportHeight > 0 && !keyboardOpen
        ? mobileViewportHeight
        : window.innerHeight;

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
      viewportHeight: effectiveViewportHeight,
      viewportBottomInset: hasFocusedAiEditable ? viewportBottomInset : 0,
      isMobile,
      isOpen,
      hasBlockingDialog,
      keyboardOpen,
      hasFocusedEditable,
      hasDensePage,
      preferCompactPanel,
      avoidRects,
    });

    setLayoutState((previous) => (areFloatingAiLayoutsEqual(previous, nextLayout) ? previous : nextLayout));
  }, [
    hasDensePage,
    hasFocusedAiEditable,
    hasFocusedEditable,
    isMobile,
    isOpen,
    keyboardOpen,
    mobileViewportHeight,
    preferCompactPanel,
    viewportBottomInset,
  ]);

  useEffect(() => {
    if (hiddenForAiPage || typeof window === "undefined") return;

    let frame = 0;
    let scheduled = false;
    let resizeObserver: ResizeObserver | null = null;
    const observedElements = new Set<Element>();

    const syncObservedElements = () => {
      if (!resizeObserver) return;
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

    let observer: MutationObserver | null = null;
    if (shouldTrackDomAggressively) {
      resizeObserver = new ResizeObserver(() => {
        scheduleSync();
      });
      observer = new MutationObserver(scheduleSync);
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "data-state", "hidden", "open"],
      });
    }

    window.addEventListener("resize", scheduleSync, { passive: true });
    window.addEventListener("scroll", scheduleSync, { passive: true });

    return () => {
      observer?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleSync);
      window.removeEventListener("scroll", scheduleSync);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [hiddenForAiPage, location, shouldTrackDomAggressively, syncLayout]);

  const minimizedStatus = resolveFloatingAIMinimizedStatus(aiStatus);

  if (hiddenForAiPage) return null;

  return (
    <div
      ref={floatingRootRef}
      className={cn(
        "pointer-events-none fixed transition-opacity duration-200",
        styles.floatingRoot,
        isMobile && shouldShowPanel ? "z-[60]" : "",
        layoutState.rootHidden || (hideForFocusedEditable && !isOpen)
          ? "translate-y-2 opacity-0"
          : "opacity-100",
      )}
      aria-hidden={layoutState.rootHidden}
      hidden={layoutState.rootHidden}
    >
      {isMobile && shouldShowPanel ? (
        <div
          className={cn("pointer-events-auto", styles.floatingMobileBackdrop)}
          aria-hidden="true"
          onClick={handleMinimize}
        />
      ) : null}
      {shouldKeepPanelMounted ? (
        <div
          hidden={!shouldShowPanel}
          aria-hidden={!shouldShowPanel}
          className={cn(
            "pointer-events-none absolute transition-all duration-200",
            styles.floatingPanelShell,
            layoutState.panel.mode === "fullscreen" ? styles.floatingPanelShellFullscreen : "",
            shouldShowPanel ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
          )}
        >
          <section
            className={cn(
              "flex h-full w-full flex-col overflow-hidden border bg-white/98 text-slate-900 shadow-xl ring-1 ring-slate-900/8 backdrop-blur-sm dark:bg-slate-950/98 dark:text-card-foreground dark:ring-white/10",
              shouldShowPanel ? "pointer-events-auto" : "pointer-events-none",
              layoutState.panel.mode === "fullscreen"
                ? styles.floatingPanelFullscreenSurface
                : "",
              layoutState.panel.mode === "sheet"
                ? "rounded-[24px] border-sky-400/20 shadow-2xl"
                : layoutState.panel.mode === "fullscreen"
                  ? "border-sky-400/20 shadow-2xl"
                  : "rounded-[18px] border-sky-400/15",
            )}
            aria-label="AI SQR Popup"
            data-floating-ai-panel-mode={layoutState.panel.mode}
          >
            {isMobile ? (
              <div
                className={cn(
                  "flex shrink-0 justify-center",
                  layoutState.panel.mode === "fullscreen" ? "pt-2" : "pt-2",
                )}
              >
                <div className="h-1.5 w-10 rounded-full bg-slate-400/45 dark:bg-white/20" aria-hidden="true" />
              </div>
            ) : null}
            <header
              className={cn(
                "flex shrink-0 items-center justify-between border-b",
                isMobile
                  ? "border-slate-300/70 bg-slate-950/80 text-white backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/88"
                  : "border-slate-200/80 bg-gradient-to-r from-sky-500/12 via-slate-100/60 to-transparent dark:border-white/10 dark:via-transparent",
                isMobile && layoutState.panel.mode === "fullscreen"
                  ? "min-h-16 px-4"
                  : isMobile
                    ? "min-h-14 px-3.5"
                    : "h-14 px-4",
              )}
            >
              <div className="min-w-0">
                <p
                  className={cn(
                    "truncate font-semibold",
                    isMobile ? "text-white" : "text-slate-950 dark:text-slate-50",
                    layoutState.panel.mode === "fullscreen" ? "text-base" : "text-sm",
                  )}
                >
                  AI SQR
                </p>
                <p className={cn("truncate text-[11px]", isMobile ? "text-white/70" : "text-slate-600 dark:text-slate-300/90")}>
                  Smart Query Engine
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "text-xs",
                    isMobile
                      ? "text-white/80 hover:bg-white/10 hover:text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white",
                    isMobile && layoutState.panel.mode === "fullscreen"
                      ? "h-10 px-3"
                      : isMobile
                        ? "h-9 px-2.5"
                        : "h-8 px-2",
                  )}
                  onClick={handleReset}
                  disabled={messages.length === 0 && !isThinking}
                >
                  Reset Sesi
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={cn(
                    isMobile
                      ? "text-white/80 hover:bg-white/10 hover:text-white"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white",
                    isMobile && layoutState.panel.mode === "fullscreen"
                      ? "h-10 w-10"
                      : isMobile
                        ? "h-9 w-9"
                        : "h-8 w-8",
                  )}
                  onClick={handleMinimize}
                  aria-label="Minimize AI panel"
                >
                  <Minimize2 className="h-4 w-4" />
                </Button>
              </div>
            </header>
            <div
              className={cn(
                "min-h-0 flex-1 overflow-hidden",
                layoutState.panel.mode === "fullscreen"
                  ? "p-3"
                  : isMobile
                    ? "p-2.5"
                    : "p-3",
              )}
            >
              <div className="h-full min-h-0">
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
                    compactMode={preferCompactPanel}
                    onStatusChange={setAiStatus}
                    onCancelAISearchReady={(cancelFn) => {
                      cancelAISearchRef.current = cancelFn;
                    }}
                  />
                </Suspense>
              </div>
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
            "pointer-events-auto relative flex items-center justify-center rounded-full border border-sky-300/30 bg-sky-500 text-white shadow-[0_18px_38px_rgba(14,165,233,0.33)] transition-transform hover:scale-[1.03]",
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
