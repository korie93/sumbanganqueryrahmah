import { useEffect, useState } from "react";
import { MOBILE_MEDIA_QUERY, isMobileViewportWidth } from "@/lib/responsive";

export function useActivityLogsLayoutPreference() {
  const [preferMobileLayout, setPreferMobileLayout] = useState(
    () => typeof window !== "undefined" && isMobileViewportWidth(window.innerWidth),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(MOBILE_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setPreferMobileLayout(event.matches);
    };

    setPreferMobileLayout(mediaQuery.matches);
    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, []);

  return preferMobileLayout;
}
