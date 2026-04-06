import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { useMobileViewportState } from "@/hooks/use-mobile-viewport-state";
import {
  areFloatingAiLayoutsEqual,
  resolveFloatingAiLayout,
  type FloatingAiLayout,
} from "@/components/floating-ai-layout";
import { applyFloatingAiScrollLock } from "@/components/floating-ai-scroll-lock";
import { shouldTrackFloatingAiDom } from "@/components/floating-ai-visibility";
import {
  FLOATING_AI_AVOID_SELECTOR,
  FLOATING_AI_DIALOG_SELECTOR,
  collectFloatingAiAvoidRects,
  hasFloatingAiBlockingDialog,
  isEditableElement,
  resolveFloatingAiHasDensePage,
} from "@/components/floating-ai-dom-utils";
import type { AIChatStatus } from "@/components/AIChat";

type UseFloatingAILayoutStateParams = {
  activePage: string;
  location: string;
  hiddenForAiPage: boolean;
  isMobile: boolean;
  isOpen: boolean;
  isThinking: boolean;
  aiStatus: AIChatStatus;
  messageCount: number;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
};

export function useFloatingAILayoutState({
  activePage,
  location,
  hiddenForAiPage,
  isMobile,
  isOpen,
  isThinking,
  aiStatus,
  messageCount,
  setIsOpen,
}: UseFloatingAILayoutStateParams) {
  const {
    keyboardOpen,
    bottomInset: viewportBottomInset,
    viewportHeight: mobileViewportHeight,
  } = useMobileViewportState();
  const [hasFocusedEditable, setHasFocusedEditable] = useState(false);
  const [hasFocusedAiEditable, setHasFocusedAiEditable] = useState(false);
  const [layoutState, setLayoutState] = useState<FloatingAiLayout>(() =>
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
  const floatingRootRef = useRef<HTMLDivElement | null>(null);
  const shouldTrackObstacleLayout = shouldTrackFloatingAiDom({
    isOpen,
    isThinking,
    aiStatus,
  });
  const hasDensePage = useMemo(
    () => resolveFloatingAiHasDensePage(activePage, location),
    [activePage, location],
  );
  const preferCompactPanel =
    isMobile
    && (
      (messageCount === 0 && !isThinking && aiStatus === "IDLE")
      || hasFocusedAiEditable
    );

  useEffect(() => {
    if (hiddenForAiPage || typeof document === "undefined") return;

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
  }, [hiddenForAiPage]);

  useEffect(() => {
    if (hiddenForAiPage || !isMobile || !isOpen || !hasFocusedEditable) return;
    setIsOpen(false);
  }, [hasFocusedEditable, hiddenForAiPage, isMobile, isOpen, setIsOpen]);

  useEffect(() => {
    if (hiddenForAiPage || !isOpen || !layoutState.shouldAutoMinimize) return;
    setIsOpen(false);
  }, [hiddenForAiPage, isOpen, layoutState.shouldAutoMinimize, setIsOpen]);

  useEffect(() => {
    if (hiddenForAiPage || typeof document === "undefined") return;
    if (!isMobile || !isOpen || layoutState.rootHidden) return;

    return applyFloatingAiScrollLock({
      bodyStyle: document.body.style,
      documentElementStyle: document.documentElement.style,
      windowObject: window,
    });
  }, [hiddenForAiPage, isMobile, isOpen, layoutState.rootHidden]);

  const syncLayout = useCallback(() => {
    if (hiddenForAiPage || typeof window === "undefined") return;
    const effectiveViewportHeight =
      isMobile && mobileViewportHeight > 0 && !keyboardOpen
        ? mobileViewportHeight
        : window.innerHeight;

    const nextLayout = resolveFloatingAiLayout({
      viewportWidth: window.innerWidth,
      viewportHeight: effectiveViewportHeight,
      viewportBottomInset: hasFocusedAiEditable ? viewportBottomInset : 0,
      isMobile,
      isOpen,
      hasBlockingDialog: shouldTrackObstacleLayout ? hasFloatingAiBlockingDialog() : false,
      keyboardOpen,
      hasFocusedEditable,
      hasDensePage,
      preferCompactPanel,
      avoidRects: shouldTrackObstacleLayout ? collectFloatingAiAvoidRects() : [],
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
    shouldTrackObstacleLayout,
    viewportBottomInset,
  ]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let frame = 0;
    let scheduled = false;
    let resizeObserver: ResizeObserver | null = null;
    const observedElements = new Set<Element>();

    const syncObservedElements = () => {
      if (!resizeObserver) return;
      const nextElements = new Set<Element>([
        ...document.querySelectorAll(FLOATING_AI_AVOID_SELECTOR),
        ...document.querySelectorAll(FLOATING_AI_DIALOG_SELECTOR),
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
    if (shouldTrackObstacleLayout) {
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
    if (shouldTrackObstacleLayout) {
      window.addEventListener("scroll", scheduleSync, { passive: true });
    }

    return () => {
      observer?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleSync);
      if (shouldTrackObstacleLayout) {
        window.removeEventListener("scroll", scheduleSync);
      }
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [hiddenForAiPage, shouldTrackObstacleLayout, syncLayout]);

  return {
    floatingRootRef,
    hasFocusedEditable,
    layoutState,
    preferCompactPanel,
  };
}
