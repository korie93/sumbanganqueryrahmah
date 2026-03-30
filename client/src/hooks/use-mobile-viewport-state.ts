import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";

const MOBILE_KEYBOARD_THRESHOLD_PX = 120;

export type MobileViewportState = {
  keyboardOpen: boolean;
  bottomInset: number;
  viewportHeight: number;
};

export function resolveMobileViewportState(
  windowInnerHeight: number,
  viewportHeight: number,
  viewportOffsetTop = 0,
): MobileViewportState {
  const safeViewportHeight = Math.max(0, Math.round(viewportHeight));
  const visibleBottom = Math.max(
    0,
    Math.min(windowInnerHeight, Math.round(viewportOffsetTop + safeViewportHeight)),
  );
  const bottomInset = Math.max(0, windowInnerHeight - visibleBottom);
  const viewportDelta = Math.max(0, windowInnerHeight - safeViewportHeight);
  const keyboardOpen =
    viewportDelta > MOBILE_KEYBOARD_THRESHOLD_PX || bottomInset > MOBILE_KEYBOARD_THRESHOLD_PX;

  return {
    keyboardOpen,
    bottomInset,
    viewportHeight: safeViewportHeight || windowInnerHeight,
  };
}

export function useMobileViewportState() {
  const isMobile = useIsMobile();
  const [state, setState] = React.useState<MobileViewportState>({
    keyboardOpen: false,
    bottomInset: 0,
    viewportHeight: 0,
  });

  React.useEffect(() => {
    if (!isMobile || typeof window === "undefined" || !window.visualViewport) {
      setState((previous) =>
        previous.keyboardOpen === false && previous.bottomInset === 0 && previous.viewportHeight === 0
          ? previous
          : { keyboardOpen: false, bottomInset: 0, viewportHeight: 0 },
      );
      return;
    }

    const viewport = window.visualViewport;
    let frame = 0;

    const syncViewportState = () => {
      const nextState = resolveMobileViewportState(
        window.innerHeight,
        viewport.height,
        viewport.offsetTop,
      );

      setState((previous) =>
        previous.keyboardOpen === nextState.keyboardOpen &&
        previous.bottomInset === nextState.bottomInset &&
        previous.viewportHeight === nextState.viewportHeight
          ? previous
          : nextState,
      );
    };

    const scheduleSync = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        syncViewportState();
      });
    };

    syncViewportState();
    viewport.addEventListener("resize", scheduleSync);
    viewport.addEventListener("scroll", scheduleSync);
    window.addEventListener("orientationchange", scheduleSync);

    return () => {
      viewport.removeEventListener("resize", scheduleSync);
      viewport.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("orientationchange", scheduleSync);
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [isMobile]);

  return state;
}
