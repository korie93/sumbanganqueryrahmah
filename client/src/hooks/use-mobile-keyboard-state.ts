import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { resolveMobileViewportState } from "@/hooks/use-mobile-viewport-state";

export function resolveMobileKeyboardOpenState(
  windowInnerHeight: number,
  viewportHeight: number,
  viewportOffsetTop = 0,
) {
  return resolveMobileViewportState(windowInnerHeight, viewportHeight, viewportOffsetTop).keyboardOpen;
}

export function useMobileKeyboardState() {
  const isMobile = useIsMobile();
  const [keyboardOpen, setKeyboardOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isMobile || typeof window === "undefined" || !window.visualViewport) {
      setKeyboardOpen(false);
      return;
    }

    const viewport = window.visualViewport;
    let frame = 0;

    const syncKeyboardState = () => {
      const nextKeyboardOpen = resolveMobileKeyboardOpenState(
        window.innerHeight,
        viewport.height,
        viewport.offsetTop,
      );
      setKeyboardOpen((previous) => (previous === nextKeyboardOpen ? previous : nextKeyboardOpen));
    };

    const scheduleSync = () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        syncKeyboardState();
      });
    };

    syncKeyboardState();
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

  return keyboardOpen;
}
