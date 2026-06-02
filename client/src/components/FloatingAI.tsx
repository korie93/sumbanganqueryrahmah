import { memo, useCallback, useId, useRef, type KeyboardEvent, type MouseEvent } from "react";
import { useLocation } from "wouter";
import {
  FloatingRootContainer,
} from "@/components/FloatingAIShell";
import { FloatingAIPanel } from "@/components/FloatingAIPanel";
import { FloatingAITrigger } from "@/components/FloatingAITrigger";
import { useIsMobile } from "@/hooks/use-mobile";
import { resolveFloatingAIMinimizedStatus } from "@/components/floating-ai-status";
import {
  shouldKeepFloatingAiPanelMounted,
} from "@/components/floating-ai-visibility";
import { useFloatingAIBehaviorState } from "@/components/useFloatingAIBehaviorState";
import { useFloatingAIFocusManagement } from "@/components/useFloatingAIFocusManagement";
import { useFloatingAILayoutState } from "@/components/useFloatingAILayoutState";
import { cn } from "@/lib/utils";
import styles from "./FloatingAI.module.css";

type FloatingAIProps = {
  timeoutMs: number;
  aiEnabled: boolean;
  activePage: string;
  systemName?: string | undefined;
};

const DEFAULT_FLOATING_AI_SYSTEM_NAME = "SQR";

function resolveFloatingAiSystemName(systemName: string | undefined) {
  return systemName?.trim() || DEFAULT_FLOATING_AI_SYSTEM_NAME;
}

function FloatingAI({ timeoutMs, aiEnabled, activePage, systemName }: FloatingAIProps) {
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
  const panelId = useId();
  const panelTitleId = useId();
  const panelDescriptionId = useId();
  const panelSurfaceRef = useRef<HTMLElement | null>(null);
  const triggerButtonRef = useRef<HTMLButtonElement | null>(null);

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
  const handleBackdropKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Escape" && event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    event.currentTarget.blur();
    handleMinimize();
  }, [handleMinimize]);

  useFloatingAIFocusManagement({
    floatingRootRef,
    handleMinimize,
    isMobile,
    layoutState,
    panelSurfaceRef,
    shouldShowPanel,
    triggerButtonRef,
  });

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
            "pointer-events-auto appearance-none border-0 bg-transparent p-0",
            styles.floatingMobileBackdrop,
          )}
          aria-label={`Tutup panel ${assistantLabel}`}
          onClick={handleBackdropClick}
          onKeyDown={handleBackdropKeyDown}
        />
      ) : null}
      <FloatingAIPanel
        activePage={activePage}
        aiEnabled={aiEnabled}
        assistantLabel={assistantLabel}
        handlePanelMinimizeClick={handlePanelMinimizeClick}
        handleReset={handleReset}
        isMobile={isMobile}
        isOpen={isOpen}
        isThinking={isThinking}
        layoutState={layoutState}
        messagesLength={messages.length}
        modalDialogA11yProps={modalDialogA11yProps}
        panelDescriptionId={panelDescriptionId}
        panelId={panelId}
        panelSurfaceRef={panelSurfaceRef}
        panelTitleId={panelTitleId}
        preferCompactPanel={preferCompactPanel}
        registerCancelAISearch={registerCancelAISearch}
        setAiStatus={setAiStatus}
        shouldKeepPanelMounted={shouldKeepPanelMounted}
        shouldShowPanel={shouldShowPanel}
        timeoutMs={timeoutMs}
      />
      <FloatingAITrigger
        assistantLabel={assistantLabel}
        handleTriggerToggleClick={handleTriggerToggleClick}
        hideForFocusedEditable={hideForFocusedEditable}
        isMobile={isMobile}
        isOpen={isOpen}
        isThinking={isThinking}
        layoutState={layoutState}
        minimizedStatus={minimizedStatus}
        panelId={panelId}
        triggerButtonRef={triggerButtonRef}
        unreadCount={unreadCount}
      />
    </FloatingRootContainer>
  );
}

export default memo(FloatingAI);
