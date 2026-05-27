import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { applyFloatingAiModalAccessibility } from "@/components/floating-ai-accessibility";
import type { FloatingAiLayout } from "@/components/floating-ai-layout-types";

type UseFloatingAIFocusManagementParams = {
  floatingRootRef: RefObject<HTMLDivElement | null>;
  handleMinimize: () => void;
  isMobile: boolean;
  layoutState: FloatingAiLayout;
  panelSurfaceRef: RefObject<HTMLElement | null>;
  shouldShowPanel: boolean;
  triggerButtonRef: RefObject<HTMLButtonElement | null>;
};

export function useFloatingAIFocusManagement({
  floatingRootRef,
  handleMinimize,
  isMobile,
  layoutState,
  panelSurfaceRef,
  shouldShowPanel,
  triggerButtonRef,
}: UseFloatingAIFocusManagementParams): void {
  const wasPanelVisibleRef = useRef(false);
  const pendingTriggerFocusRestoreRef = useRef(false);
  const restoreFocusFrameRef = useRef<number | null>(null);

  const focusTriggerButton = useCallback(() => {
    if (layoutState.rootHidden) {
      return false;
    }

    const triggerButton = triggerButtonRef.current;
    if (!triggerButton?.isConnected) {
      return false;
    }

    if (triggerButton.closest("[hidden]")) {
      return false;
    }

    triggerButton.focus({ preventScroll: true });
    return true;
  }, [layoutState.rootHidden, triggerButtonRef]);

  const restoreTriggerFocusSoon = useCallback(() => {
    pendingTriggerFocusRestoreRef.current = true;

    if (typeof window === "undefined") {
      if (focusTriggerButton()) {
        pendingTriggerFocusRestoreRef.current = false;
      }
      return;
    }

    if (restoreFocusFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreFocusFrameRef.current);
    }

    restoreFocusFrameRef.current = window.requestAnimationFrame(() => {
      restoreFocusFrameRef.current = null;
      if (focusTriggerButton()) {
        pendingTriggerFocusRestoreRef.current = false;
      }
    });
  }, [focusTriggerButton]);

  useEffect(() => () => {
    if (restoreFocusFrameRef.current !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(restoreFocusFrameRef.current);
      restoreFocusFrameRef.current = null;
    }
  }, []);

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
  }, [floatingRootRef, handleMinimize, isMobile, panelSurfaceRef, shouldShowPanel]);

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
  }, [isMobile, panelSurfaceRef, shouldShowPanel]);

  useEffect(() => {
    if (isMobile || !shouldShowPanel || typeof document === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      const activeElement = document.activeElement;
      const panelElement = panelSurfaceRef.current;
      const rootElement = floatingRootRef.current;
      const focusHasNoInteractiveOwner =
        activeElement === document.body
        || activeElement === document.documentElement;
      const focusWithinFloatingAi = Boolean(
        focusHasNoInteractiveOwner
        || (
          activeElement
          && (
            panelElement?.contains(activeElement)
            || rootElement?.contains(activeElement)
          )
        ),
      );
      if (!focusWithinFloatingAi) {
        return;
      }

      event.preventDefault();
      handleMinimize();
      restoreTriggerFocusSoon();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [floatingRootRef, handleMinimize, isMobile, panelSurfaceRef, restoreTriggerFocusSoon, shouldShowPanel]);

  useLayoutEffect(() => {
    const wasVisible = wasPanelVisibleRef.current;
    wasPanelVisibleRef.current = shouldShowPanel;

    if (
      !wasVisible
      || shouldShowPanel
      || layoutState.rootHidden
    ) {
      return;
    }

    pendingTriggerFocusRestoreRef.current = false;
    focusTriggerButton();
  }, [focusTriggerButton, layoutState.rootHidden, shouldShowPanel]);

  useLayoutEffect(() => {
    if (
      !pendingTriggerFocusRestoreRef.current
      || shouldShowPanel
      || layoutState.rootHidden
    ) {
      return;
    }

    if (focusTriggerButton()) {
      pendingTriggerFocusRestoreRef.current = false;
    }
  }, [focusTriggerButton, layoutState.rootHidden, shouldShowPanel]);
}
