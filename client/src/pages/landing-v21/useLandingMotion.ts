import { useEffect, useState, type RefObject } from "react";
import { detectLowSpecMode } from "@/lib/low-spec-mode";

type PerformanceNavigator = Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };

export function useLandingMotion() {
  const [preferences, setPreferences] = useState({ reduced: true, lowSpec: true, hidden: false, touch: false });
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const pointer = window.matchMedia("(pointer: coarse)");
    const nav = navigator as PerformanceNavigator;
    const update = () => setPreferences({
      reduced: motion.matches,
      lowSpec: detectLowSpecMode() || document.documentElement.classList.contains("low-spec")
        || (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 4)
        || (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 4)
        || nav.connection?.saveData === true || ["slow-2g", "2g"].includes(nav.connection?.effectiveType ?? ""),
      hidden: document.hidden, touch: pointer.matches,
    });
    update();
    motion.addEventListener("change", update);
    pointer.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      motion.removeEventListener("change", update);
      pointer.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);
  return { ...preferences, paused: preferences.reduced || preferences.lowSpec || preferences.hidden };
}

export function useOnScreen(ref: RefObject<HTMLElement>) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!window.IntersectionObserver) { setVisible(true); return; }
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting && entry.intersectionRatio > 0.08), { threshold: [0, 0.08, 0.2] });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return visible;
}

/** All observers and classes are local to the landing subtree, with navigation cleanup. */
export function useLandingSections(ref: RefObject<HTMLDivElement>, paused: boolean) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const sections = [...root.querySelectorAll<HTMLElement>("#home, #workflow, #features, #security, #about")];
    const links = [...root.querySelectorAll<HTMLAnchorElement>(".nav-links a")];
    if (!window.IntersectionObserver) { sections.forEach(section => section.classList.add("is-visible")); return; }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const active = entry.isIntersecting;
        entry.target.classList.toggle("motion-offscreen", !active);
        if (active) entry.target.classList.add("is-visible");
        if (entry.target.id === "security") entry.target.classList.toggle("security-motion-active", active && !paused);
      }
    }, { threshold: [0, 0.08] });
    const navigation = new IntersectionObserver(entries => {
      const active = entries.filter(entry => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!active) return;
      links.forEach(link => {
        const current = link.hash === `#${active.target.id}`;
        link.classList.toggle("is-active", current);
        if (current) link.setAttribute("aria-current", "location"); else link.removeAttribute("aria-current");
      });
    }, { rootMargin: "-18% 0px -55% 0px", threshold: [0, 0.08, 0.2] });
    sections.forEach(section => { observer.observe(section); navigation.observe(section); });
    return () => { observer.disconnect(); navigation.disconnect(); };
  }, [ref, paused]);
}
