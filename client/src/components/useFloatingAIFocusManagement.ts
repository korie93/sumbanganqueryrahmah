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
  const restoreFocusTimeoutRef = useRef<number | null>(null);

  const restoreTriggerFocusSoon = useCallback(() => {
    if (typeof window === "undefined") {
      triggerButtonRef.current?.focus();
      return;
    }

    if (restoreFocusTimeoutRef.current !== null) {
      window.clearTimeout(restoreFocusTimeoutRef.current);
    }

    restoreFocusTimeoutRef.current = window.setTimeout(() => {
      restoreFocusTimeoutRef.current = null;
      triggerButtonRef.current?.focus();
    }, 0);
  }, [triggerButtonRef]);

  useEffect(() => () => {
    if (restoreFocusTimeoutRef.current !== null && typeof window !== "undefined") {
      window.clearTimeout(restoreFocusTimeoutRef.current);
      restoreFocusTimeoutRef.current = null;
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
      const focusWithinFloatingAi = Boolean(
        activeElement
        && (
          panelElement?.contains(activeElement)
          || rootElement?.contains(activeElement)
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
      || layoutState.triggerHidden
    ) {
      return;
    }

    triggerButtonRef.current?.focus();
  }, [layoutState.rootHidden, layoutState.triggerHidden, shouldShowPanel, triggerButtonRef]);
}
