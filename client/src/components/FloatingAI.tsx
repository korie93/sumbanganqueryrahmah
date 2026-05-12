import { Suspense, lazy, useCallback, useEffect, useId, useRef, type MouseEvent } from "react";
import { Bot, Minimize2 } from "lucide-react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  FloatingPanelShell,
  FloatingRootContainer,
  FloatingTriggerShell,
} from "@/components/FloatingAIShell";
import { useIsMobile } from "@/hooks/use-mobile";
import { resolveFloatingAIMinimizedStatus } from "@/components/floating-ai-status";
import {
  shouldKeepFloatingAiPanelMounted,
} from "@/components/floating-ai-visibility";
import { applyFloatingAiModalAccessibility } from "@/components/floating-ai-accessibility";
import { FloatingAIChatErrorBoundary } from "@/components/FloatingAIChatErrorBoundary";
import { useFloatingAIBehaviorState } from "@/components/useFloatingAIBehaviorState";
import { useFloatingAILayoutState } from "@/components/useFloatingAILayoutState";
import { cn } from "@/lib/utils";
import styles from "./FloatingAI.module.css";

const AIChat = lazy(() => import("@/components/AIChat"));

type FloatingAIProps = {
  timeoutMs: number;
  aiEnabled: boolean;
  activePage: string;
  systemName?: string | undefined;
};

const DEFAULT_FLOATING_AI_SYSTEM_NAME = "SQR";
const FLOATING_AI_PANEL_DESCRIPTION = "Panel bantuan AI untuk pertanyaan berkaitan koleksi dan rekod";

function resolveFloatingAiSystemName(systemName: string | undefined) {
  return systemName?.trim() || DEFAULT_FLOATING_AI_SYSTEM_NAME;
}

export default function FloatingAI({ timeoutMs, aiEnabled, activePage, systemName }: FloatingAIProps) {
  const isMobile = useIsMobile();
  const [location] = useLocation();
  const hiddenForAiPage = activePage === "ai" || location.toLowerCase() === "/ai";
  const resolvedSystemName = resolveFloatingAiSystemName(systemName);
  const assistantLabel = `AI ${resolvedSystemName}`;
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
  // Desktop floating AI remains a non-modal dialog; only the mobile sheet traps
  // focus and isolates the page, so only mobile should claim aria-modal=true.
  const modalDialogA11yProps = isMobile
    ? ({
      "aria-modal": "true",
    } as const)
    : {};
  const triggerDisclosureA11yProps = {
    "aria-expanded": isOpen,
  } as const;
  const panelId = useId();
  const panelTitleId = useId();
  const panelDescriptionId = useId();
  const panelSurfaceRef = useRef<HTMLElement | null>(null);
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);
  const wasDesktopPanelVisibleRef = useRef(false);

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

    const dialogElement = panelSurfaceRef.current;
    if (!dialogElement) {
      return;
    }

    return applyFloatingAiModalAccessibility({
      rootElement,
      dialogElement,
      onEscapeKeyDown: handleMinimize,
    });
  }, [floatingRootRef, handleMinimize, isMobile, shouldShowPanel]);

  useEffect(() => {
    if (isMobile || !shouldShowPanel || typeof window === "undefined") {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const dialogElement = panelSurfaceRef.current;
      const queryInput = dialogElement?.querySelector<HTMLElement>(
        "[data-floating-ai-query-input='true']",
      );

      (queryInput ?? dialogElement)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isMobile, shouldShowPanel]);

  useEffect(() => {
    if (isMobile) {
      wasDesktopPanelVisibleRef.current = false;
      return;
    }

    const wasVisible = wasDesktopPanelVisibleRef.current;
    wasDesktopPanelVisibleRef.current = shouldShowPanel;

    if (
      wasVisible
      && !shouldShowPanel
      && !layoutState.rootHidden
      && !layoutState.triggerHidden
    ) {
      triggerButtonRef.current?.focus();
    }
  }, [isMobile, layoutState.rootHidden, layoutState.triggerHidden, shouldShowPanel]);

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
          aria-label="Tutup panel AI"
          onClick={handleBackdropClick}
        />
      ) : null}
      {shouldKeepPanelMounted ? (
        <FloatingPanelShell
          hidden={!shouldShowPanel}
          className={cn(
            "pointer-events-none absolute transition-[opacity,transform] duration-200",
            styles.floatingPanelShell,
            layoutState.panel.mode === "fullscreen" ? styles.floatingPanelShellFullscreen : "",
            shouldShowPanel ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0",
          )}
        >
          <section
            ref={panelSurfaceRef}
            id={panelId}
            className={cn(
              "flex h-full w-full flex-col overflow-hidden border supports-[backdrop-filter]:backdrop-blur-sm",
              styles.floatingPanelSurface,
              shouldShowPanel ? "pointer-events-auto" : "pointer-events-none",
              layoutState.panel.mode === "fullscreen"
                ? styles.floatingPanelFullscreenSurface
                : "",
              layoutState.panel.mode === "sheet"
                ? cn("rounded-[24px]", styles.floatingPanelSheetSurface)
                : layoutState.panel.mode === "fullscreen"
                  ? styles.floatingPanelFullscreenSurfaceChrome
                  : cn("rounded-[18px]", styles.floatingPanelDockedSurface),
            )}
            role="dialog"
            aria-labelledby={panelTitleId}
            aria-describedby={panelDescriptionId}
            data-floating-ai-dialog="true"
            data-floating-ai-panel-mode={layoutState.panel.mode}
            tabIndex={-1}
            {...modalDialogA11yProps}
          >
            {isMobile ? (
              <div
                className={cn(
                  "flex shrink-0 justify-center",
                  layoutState.panel.mode === "fullscreen" ? "pt-3" : "pt-2",
                )}
              >
                <div className={cn("h-1.5 w-10 rounded-full", styles.floatingMobileHandle)} aria-hidden="true" />
              </div>
            ) : null}
            <header
              className={cn(
                "flex shrink-0 items-center justify-between border-b",
                styles.floatingPanelHeader,
                isMobile
                  ? cn(styles.floatingPanelHeaderMobile, "supports-[backdrop-filter]:backdrop-blur-xl")
                  : styles.floatingPanelHeaderDesktop,
                isMobile && layoutState.panel.mode === "fullscreen"
                  ? "min-h-16 px-4"
                  : isMobile
                    ? "min-h-14 px-3.5"
                    : "h-14 px-4",
              )}
            >
              <div className="min-w-0">
                <h2
                  id={panelTitleId}
                  className={cn(
                    "truncate font-semibold",
                    styles.floatingPanelTitle,
                    layoutState.panel.mode === "fullscreen" ? "text-base" : "text-sm",
                  )}
                >
                  {assistantLabel}
                </h2>
                <p
                  id={panelDescriptionId}
                  className={cn("truncate text-[11px]", styles.floatingPanelDescription)}
                >
                  {FLOATING_AI_PANEL_DESCRIPTION}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className={cn(
                    "text-xs",
                    styles.floatingHeaderButton,
                    isMobile && layoutState.panel.mode === "fullscreen"
                      ? "h-10 px-3"
                      : isMobile
                        ? "h-11 px-2.5"
                        : "h-8 px-2",
                  )}
                  onClick={handleReset}
                  disabled={messages.length === 0 && !isThinking}
                  aria-label={`Reset sesi ${assistantLabel}`}
                >
                  Reset Sesi
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className={cn(
                    styles.floatingHeaderButton,
                    isMobile && layoutState.panel.mode === "fullscreen"
                      ? "h-10 w-10"
                      : isMobile
                        ? "h-11 w-11"
                        : "h-8 w-8",
                  )}
                  onClick={handlePanelMinimizeClick}
                  aria-label={`Kecilkan panel ${assistantLabel}`}
                >
                  <Minimize2 className="h-4 w-4" aria-hidden="true" />
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
                    <div
                      className="flex h-full items-center justify-center"
                      role="status"
                      aria-label={`Memuatkan panel ${assistantLabel}`}
                      aria-live="polite"
                    >
                      <div
                        className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary motion-reduce:animate-none"
                        aria-hidden="true"
                      />
                    </div>
                  }
                >
                  <FloatingAIChatErrorBoundary boundaryKey={`${activePage}:${Number(isOpen)}`}>
                    <AIChat
                      timeoutMs={timeoutMs}
                      aiEnabled={aiEnabled}
                      assistantLabel={assistantLabel}
                      compactMode={preferCompactPanel}
                      onStatusChange={setAiStatus}
                      onCancelAISearchReady={registerCancelAISearch}
                    />
                  </FloatingAIChatErrorBoundary>
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
          <div className={cn("pointer-events-none max-w-[220px] rounded-lg border px-3 py-1.5 text-[11px] shadow-sm", styles.floatingMinimizedStatus)}>
            {minimizedStatus}
          </div>
        ) : null}
        <button
          ref={triggerButtonRef}
          type="button"
          onClick={handleTriggerToggleClick}
          title={assistantLabel}
          aria-controls={panelId}
          aria-haspopup="dialog"
          aria-label={isOpen ? `Kecilkan panel ${assistantLabel}` : `Buka panel ${assistantLabel}`}
          {...triggerDisclosureA11yProps}
          className={cn(
            "pointer-events-auto relative flex items-center justify-center rounded-full border transition-transform hover:scale-[1.03]",
            styles.floatingTriggerButton,
            isMobile ? "h-12 w-12" : "h-14 w-14",
            hideForFocusedEditable ? "pointer-events-none" : "",
            layoutState.triggerHidden ? "pointer-events-none scale-95 opacity-0" : "",
            !isOpen && isThinking ? styles.aiThinkingRing : "",
          )}
          data-testid="floating-ai-toggle"
        >
          <Bot className="h-6 w-6" aria-hidden="true" />
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
