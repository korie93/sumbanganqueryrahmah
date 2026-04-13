import { Suspense, lazy, useCallback, useEffect, useId, type MouseEvent, type ReactNode, type Ref } from "react";
import { Bot, Minimize2 } from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { resolveFloatingAIMinimizedStatus } from "@/components/floating-ai-status";
import {
  shouldKeepFloatingAiPanelMounted,
} from "@/components/floating-ai-visibility";
import { applyFloatingAiModalIsolation } from "@/components/floating-ai-accessibility";
import { useFloatingAIBehaviorState } from "@/components/useFloatingAIBehaviorState";
import { useFloatingAILayoutState } from "@/components/useFloatingAILayoutState";
import { cn } from "@/lib/utils";
import styles from "./FloatingAI.module.css";

const AIChat = lazy(() => import("@/components/AIChat"));

type FloatingAIProps = {
  timeoutMs: number;
  aiEnabled: boolean;
  activePage: string;
};

function FloatingRootContainer({
  rootRef,
  className,
  hidden,
  children,
}: {
  rootRef: Ref<HTMLDivElement>;
  className: string;
  hidden: boolean;
  children: ReactNode;
}) {
  return (
    <div ref={rootRef} className={className} hidden={hidden}>
      {children}
    </div>
  );
}

function FloatingPanelShell({
  className,
  hidden,
  children,
}: {
  className: string;
  hidden: boolean;
  children: ReactNode;
}) {
  return (
    <div hidden={hidden} className={className}>
      {children}
    </div>
  );
}

function FloatingTriggerShell({
  className,
  hidden,
  children,
}: {
  className: string;
  hidden: boolean;
  children: ReactNode;
}) {
  return (
    <div className={className} hidden={hidden}>
      {children}
    </div>
  );
}

export default function FloatingAI({ timeoutMs, aiEnabled, activePage }: FloatingAIProps) {
  const isMobile = useIsMobile();
  const [location] = useLocation();
  const hiddenForAiPage = activePage === "ai" || location.toLowerCase() === "/ai";
  const {
    messages,
    isThinking,
    unreadCount,
    isOpen,
    setIsOpen,
    hasActivated,
    aiStatus,
    setAiStatus,
    handleMinimize,
    handleToggle,
    handleReset,
    registerCancelAISearch,
  } = useFloatingAIBehaviorState({
    activePage,
    location,
  });
  const {
    floatingRootRef,
    hasFocusedEditable,
    layoutState,
    preferCompactPanel,
  } = useFloatingAILayoutState({
    activePage,
    location,
    hiddenForAiPage,
    isMobile,
    isOpen,
    isThinking,
    aiStatus,
    messageCount: messages.length,
    setIsOpen,
  });

  const hideForFocusedEditable = isMobile && hasFocusedEditable;
  const shouldKeepPanelMounted = shouldKeepFloatingAiPanelMounted({
    hasActivated,
    isOpen,
    isThinking,
    aiStatus,
  });
  const shouldShowPanel = shouldKeepPanelMounted && isOpen && !layoutState.rootHidden;
  const panelId = useId();
  const panelTitleId = useId();
  const panelDescriptionId = useId();

  const minimizedStatus = resolveFloatingAIMinimizedStatus(aiStatus);
  const handleTriggerToggleClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.blur();
    handleToggle();
  }, [handleToggle]);
  const handlePanelMinimizeClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.blur();
    handleMinimize();
  }, [handleMinimize]);
  const handleBackdropClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    event.currentTarget.blur();
    handleMinimize();
  }, [handleMinimize]);

  useEffect(() => {
    if (!isMobile || !shouldShowPanel) {
      return;
    }

    const rootElement = floatingRootRef.current;
    if (!rootElement) {
      return;
    }

    return applyFloatingAiModalIsolation(rootElement);
  }, [floatingRootRef, isMobile, shouldShowPanel]);

  if (hiddenForAiPage) return null;

  return (
    <FloatingRootContainer
      rootRef={floatingRootRef}
      className={cn(
        "pointer-events-none fixed transition-opacity duration-200",
        styles.floatingRoot,
        isMobile && shouldShowPanel ? styles.floatingRootModal : "",
        layoutState.rootHidden || (hideForFocusedEditable && !isOpen)
          ? "translate-y-2 opacity-0"
          : "opacity-100",
      )}
      hidden={layoutState.rootHidden}
    >
      {isMobile && shouldShowPanel ? (
        <button
          type="button"
          className={cn(
            "pointer-events-auto border-0 bg-transparent p-0",
            styles.floatingMobileBackdrop,
          )}
          aria-label="Close AI panel"
          onClick={handleBackdropClick}
        />
      ) : null}
      {shouldKeepPanelMounted ? (
        <FloatingPanelShell
          hidden={!shouldShowPanel}
          className={cn(
            "pointer-events-none absolute transition-all duration-200",
            styles.floatingPanelShell,
            layoutState.panel.mode === "fullscreen" ? styles.floatingPanelShellFullscreen : "",
            shouldShowPanel ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
          )}
        >
          <section
            id={panelId}
            className={cn(
              "flex h-full w-full flex-col overflow-hidden border bg-white/98 text-slate-900 shadow-xl ring-1 ring-slate-900/8 supports-[backdrop-filter]:backdrop-blur-sm dark:bg-slate-950/98 dark:text-card-foreground dark:ring-white/10",
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
            role="dialog"
            aria-modal={isMobile ? true : undefined}
            aria-labelledby={panelTitleId}
            aria-describedby={panelDescriptionId}
            data-floating-ai-dialog="true"
            data-floating-ai-panel-mode={layoutState.panel.mode}
            tabIndex={-1}
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
                  ? "border-slate-300/70 bg-slate-950/80 text-white supports-[backdrop-filter]:backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/88"
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
                  id={panelTitleId}
                  className={cn(
                    "truncate font-semibold",
                    isMobile ? "text-white" : "text-slate-950 dark:text-slate-50",
                    layoutState.panel.mode === "fullscreen" ? "text-base" : "text-sm",
                  )}
                >
                  AI SQR
                </p>
                <p
                  id={panelDescriptionId}
                  className={cn("truncate text-[11px]", isMobile ? "text-white/70" : "text-slate-600 dark:text-slate-300/90")}
                >
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
                        ? "h-11 px-2.5"
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
                        ? "h-11 w-11"
                        : "h-8 w-8",
                  )}
                  onClick={handlePanelMinimizeClick}
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
                    onCancelAISearchReady={registerCancelAISearch}
                  />
                </Suspense>
              </div>
            </div>
          </section>
        </FloatingPanelShell>
      ) : null}
      <FloatingTriggerShell
        className={cn(
          "absolute flex flex-col gap-2 pointer-events-none",
          styles.floatingTriggerShell,
          layoutState.trigger.anchor === "left" ? "items-start" : "items-end",
          layoutState.triggerHidden ? "translate-y-2 opacity-0" : "opacity-100",
        )}
        hidden={layoutState.triggerHidden}
      >
        {!isOpen && isThinking && !layoutState.rootHidden && !isMobile ? (
          <div className="pointer-events-none max-w-[220px] rounded-lg border border-blue-500/35 bg-blue-500/10 px-3 py-1.5 text-[11px] text-blue-200 shadow-sm">
            {minimizedStatus}
          </div>
        ) : null}
        <button
          type="button"
          onClick={handleTriggerToggleClick}
          title="AI SQR"
          aria-controls={panelId}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          aria-label={isOpen ? "Minimize AI SQR panel" : "Open AI SQR panel"}
          className={cn(
            "pointer-events-auto relative flex items-center justify-center rounded-full border border-sky-300/30 bg-sky-500 text-white shadow-[0_18px_38px_rgba(14,165,233,0.33)] transition-transform hover:scale-[1.03]",
            isMobile ? "h-12 w-12" : "h-14 w-14",
            hideForFocusedEditable ? "pointer-events-none" : "",
            layoutState.triggerHidden ? "pointer-events-none scale-95 opacity-0" : "",
            !isOpen && isThinking ? styles.aiThinkingRing : "",
          )}
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
      </FloatingTriggerShell>
    </FloatingRootContainer>
  );
}
