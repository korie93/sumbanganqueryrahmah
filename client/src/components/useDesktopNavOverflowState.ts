import { useEffect, useState, type RefObject } from "react";

type DesktopNavOverflowState = {
  canScroll: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
};

const EMPTY_OVERFLOW_STATE: DesktopNavOverflowState = {
  canScroll: false,
  canScrollLeft: false,
  canScrollRight: false,
};

export function useDesktopNavOverflowState(
  navScrollerRef: RefObject<HTMLElement | null>,
  layoutKey: string,
): DesktopNavOverflowState {
  const [desktopNavOverflow, setDesktopNavOverflow] = useState(EMPTY_OVERFLOW_STATE);

  useEffect(() => {
    const navNode = navScrollerRef.current;

    if (!navNode || typeof window === "undefined") {
      setDesktopNavOverflow(EMPTY_OVERFLOW_STATE);
      return;
    }

    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;

    const updateOverflowState = () => {
      frame = 0;

      const maxScrollLeft = Math.max(0, navNode.scrollWidth - navNode.clientWidth);
      const nextState = {
        canScroll: maxScrollLeft > 12,
        canScrollLeft: navNode.scrollLeft > 8,
        canScrollRight: maxScrollLeft - navNode.scrollLeft > 8,
      };

      setDesktopNavOverflow((previous) => (
        previous.canScroll === nextState.canScroll
        && previous.canScrollLeft === nextState.canScrollLeft
        && previous.canScrollRight === nextState.canScrollRight
      ) ? previous : nextState);
    };

    const scheduleOverflowUpdate = () => {
      if (frame !== 0) {
        return;
      }

      frame = window.requestAnimationFrame(updateOverflowState);
    };

    scheduleOverflowUpdate();
    navNode.addEventListener("scroll", scheduleOverflowUpdate, { passive: true });
    window.addEventListener("resize", scheduleOverflowUpdate);

    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(() => {
        scheduleOverflowUpdate();
      });
      resizeObserver.observe(navNode);
    }

    return () => {
      navNode.removeEventListener("scroll", scheduleOverflowUpdate);
      window.removeEventListener("resize", scheduleOverflowUpdate);
      resizeObserver?.disconnect();

      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [layoutKey, navScrollerRef]);

  return desktopNavOverflow;
}
