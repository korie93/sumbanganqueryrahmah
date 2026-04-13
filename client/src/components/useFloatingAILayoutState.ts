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
  collectFloatingAiDomSnapshot,
  isEditableElement,
  queryFloatingAiObstacleElements,
  resolveFloatingAiHasDensePage,
  type FloatingAiObstacleQueryResult,
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
  const syncInputsRef = useRef({
    hiddenForAiPage,
    isMobile,
    isOpen,
    shouldTrackObstacleLayout,
    keyboardOpen,
    mobileViewportHeight,
    hasFocusedAiEditable,
    viewportBottomInset,
    hasFocusedEditable,
    hasDensePage,
    preferCompactPanel,
  });
  syncInputsRef.current = {
    hiddenForAiPage,
    isMobile,
    isOpen,
    shouldTrackObstacleLayout,
    keyboardOpen,
    mobileViewportHeight,
    hasFocusedAiEditable,
    viewportBottomInset,
    hasFocusedEditable,
    hasDensePage,
    preferCompactPanel,
  };

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

  const syncLayout = useCallback((obstacleQuery?: FloatingAiObstacleQueryResult | null) => {
    const state = syncInputsRef.current;
    if (state.hiddenForAiPage || typeof window === "undefined") return;
    const effectiveViewportHeight =
      state.isMobile && state.mobileViewportHeight > 0 && !state.keyboardOpen
        ? state.mobileViewportHeight
        : window.innerHeight;
    const domSnapshot = state.shouldTrackObstacleLayout
      ? collectFloatingAiDomSnapshot(obstacleQuery ?? queryFloatingAiObstacleElements())
      : {
          avoidRects: [],
          hasBlockingDialog: false,
        };

    const nextLayout = resolveFloatingAiLayout({
      viewportWidth: window.innerWidth,
      viewportHeight: effectiveViewportHeight,
      viewportBottomInset: state.hasFocusedAiEditable ? state.viewportBottomInset : 0,
      isMobile: state.isMobile,
      isOpen: state.isOpen,
      hasBlockingDialog: domSnapshot.hasBlockingDialog,
      keyboardOpen: state.keyboardOpen,
      hasFocusedEditable: state.hasFocusedEditable,
      hasDensePage: state.hasDensePage,
      preferCompactPanel: state.preferCompactPanel,
      avoidRects: domSnapshot.avoidRects,
    });

    setLayoutState((previous) => (areFloatingAiLayoutsEqual(previous, nextLayout) ? previous : nextLayout));
  }, []);

  useEffect(() => {
    syncLayout();
  }, [
    hasDensePage,
    hasFocusedAiEditable,
    hasFocusedEditable,
    hiddenForAiPage,
    isMobile,
    isOpen,
    keyboardOpen,
    mobileViewportHeight,
    preferCompactPanel,
    shouldTrackObstacleLayout,
    viewportBottomInset,
  ]);

  useEffect(() => {
    if (hiddenForAiPage || typeof document === "undefined" || typeof window === "undefined") return;

    let frame = 0;
    let resizeDebounceHandle: number | null = null;
    let scheduled = false;
    let resizeObserver: ResizeObserver | null = null;
    const observedElements = new Set<Element>();

    const syncObservedElements = (obstacleQuery?: FloatingAiObstacleQueryResult | null) => {
      if (!resizeObserver) return;
      const nextElements = new Set<Element>(obstacleQuery?.observedElements ?? []);

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
        const obstacleQuery = shouldTrackObstacleLayout ? queryFloatingAiObstacleElements() : null;
        syncObservedElements(obstacleQuery);
        syncLayout(obstacleQuery);
      });
    };

    const scheduleResizeSync = () => {
      if (resizeDebounceHandle !== null) {
        window.clearTimeout(resizeDebounceHandle);
      }

      resizeDebounceHandle = window.setTimeout(() => {
        resizeDebounceHandle = null;
        scheduleSync();
      }, 80);
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

    window.addEventListener("resize", scheduleResizeSync, { passive: true });
    if (shouldTrackObstacleLayout) {
      window.addEventListener("scroll", scheduleSync, { passive: true });
    }

    return () => {
      observer?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", scheduleResizeSync);
      if (shouldTrackObstacleLayout) {
        window.removeEventListener("scroll", scheduleSync);
      }
      if (resizeDebounceHandle !== null) {
        window.clearTimeout(resizeDebounceHandle);
      }
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [hiddenForAiPage, shouldTrackObstacleLayout]);

  return {
    floatingRootRef,
    hasFocusedEditable,
    layoutState,
    preferCompactPanel,
  };
}
