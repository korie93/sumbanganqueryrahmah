import { useEffect, useState } from "react";

export function useActivityLogsLayoutPreference() {
  const [preferMobileLayout, setPreferMobileLayout] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 768,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia("(max-width: 767px)");
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
