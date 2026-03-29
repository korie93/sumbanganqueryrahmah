import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";

const MOBILE_KEYBOARD_THRESHOLD_PX = 120;

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
      const viewportHeightDelta = window.innerHeight - viewport.height;
      const nextKeyboardOpen = viewportHeightDelta > MOBILE_KEYBOARD_THRESHOLD_PX;
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
