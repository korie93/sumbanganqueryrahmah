import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

type LandingTheme = "light" | "dark";
const THEME_KEY = "sqr-landing-next-theme";

function preferredTheme(): LandingTheme {
  try {
    const saved = window.localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* The landing remains usable when storage is unavailable. */ }
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** Landing-owned enhancement only: no auth requests, shared theme writes or idle frame loop. */
export function useLandingNextMotion(root: RefObject<HTMLDivElement>, paused: boolean) {
  const [theme, setTheme] = useState<LandingTheme>(preferredTheme);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("top");
  const [boostedFigure, setBoostedFigure] = useState<string | null>(null);
  const [replayVersion, setReplayVersion] = useState(0);
  const [coordinateLabel, setCoordinateLabel] = useState("SQR // 2026");
  const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
  const replayTimer = useRef<number | null>(null);
  const manualTheme = useRef(false);
  const motionPaused = paused || hidden;

  const toggleTheme = useCallback(() => {
    manualTheme.current = true;
    setTheme(previous => previous === "dark" ? "light" : "dark");
  }, []);

  useEffect(() => {
    if (!manualTheme.current) return;
    try { window.localStorage.setItem(THEME_KEY, theme); } catch { /* Optional persistence. */ }
  }, [theme]);

  useEffect(() => {
    try { manualTheme.current = ["light", "dark"].includes(window.localStorage.getItem(THEME_KEY) ?? ""); } catch { /* Use OS preference. */ }
    const preference = window.matchMedia("(prefers-color-scheme: dark)");
    const updateTheme = () => { if (!manualTheme.current) setTheme(preference.matches ? "dark" : "light"); };
    const updateVisibility = () => setHidden(document.hidden);
    preference.addEventListener("change", updateTheme);
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      preference.removeEventListener("change", updateTheme);
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, []);

  useEffect(() => {
    const breakpoint = window.matchMedia("(min-width: 721px)");
    const closeOnDesktop = () => { if (breakpoint.matches) setMenuOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !menuOpen) return;
      event.preventDefault();
      setMenuOpen(false);
      root.current?.querySelector<HTMLButtonElement>("#landing-next-menu-toggle")?.focus();
    };
    breakpoint.addEventListener("change", closeOnDesktop);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      breakpoint.removeEventListener("change", closeOnDesktop);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menuOpen, root]);

  const replay = useCallback((id: string) => {
    if (replayTimer.current !== null) window.clearTimeout(replayTimer.current);
    if (motionPaused) { setBoostedFigure(null); return; }
    setBoostedFigure(id);
    setReplayVersion(previous => previous + 1);
    replayTimer.current = window.setTimeout(() => {
      replayTimer.current = null;
      setBoostedFigure(null);
    }, 2_200);
  }, [motionPaused]);

  useEffect(() => {
    // A lazy route can mount after the browser's initial fragment lookup.
    const id = window.location.hash.slice(1);
    const element = root.current;
    if (!id || !element) return;
    const target = [...element.querySelectorAll<HTMLElement>("[id]")].find(node => node.id === id);
    if (!target) return;
    const frame = window.requestAnimationFrame(() => target.scrollIntoView({ block: "start", behavior: "instant" }));
    return () => window.cancelAnimationFrame(frame);
  }, [root]);

  useEffect(() => {
    if (motionPaused) {
      if (replayTimer.current !== null) window.clearTimeout(replayTimer.current);
      replayTimer.current = null;
      setBoostedFigure(null);
    }
    return () => {
      if (replayTimer.current !== null) window.clearTimeout(replayTimer.current);
      replayTimer.current = null;
    };
  }, [motionPaused]);

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const panels = [...element.querySelectorAll<HTMLElement>(".panel")];
    const hero = element.querySelector<HTMLElement>(".hero");
    if (typeof IntersectionObserver !== "function") {
      panels.forEach(panel => panel.classList.add("in", "is-visible"));
      return;
    }
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        entry.target.classList.toggle("is-visible", entry.isIntersecting);
        if (entry.isIntersecting) entry.target.classList.add("in");
        if (entry.target === hero) entry.target.classList.toggle("off", !entry.isIntersecting);
      }
    }, { threshold: [0, 0.08] });
    panels.forEach(panel => observer.observe(panel));
    if (hero) observer.observe(hero);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    const element = root.current;
    if (!element || motionPaused) return;
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    let frame: number | null = null;
    let pending: { target: HTMLElement; x: number; y: number } | null = null;
    const touched = new Set<HTMLElement>();
    const reset = (target: HTMLElement) => {
      for (const name of ["--tx", "--ty", "--bx", "--by", "--fx", "--fy"]) target.style.removeProperty(name);
      touched.delete(target);
    };
    const paint = () => {
      frame = null;
      if (!pending || !finePointer.matches || !pending.target.isConnected) return;
      const { target, x, y } = pending;
      const box = target.getBoundingClientRect();
      const horizontal = Math.max(0, Math.min(1, (x - box.left) / Math.max(1, box.width)));
      const vertical = Math.max(0, Math.min(1, (y - box.top) / Math.max(1, box.height)));
      touched.add(target);
      if (target.classList.contains("fig")) {
        target.style.setProperty("--fx", horizontal * 100 + "%");
        target.style.setProperty("--fy", vertical * 100 + "%");
        target.style.setProperty("--tx", (0.5 - vertical) * 6 + "deg");
        target.style.setProperty("--ty", (horizontal - 0.5) * 6 + "deg");
      } else {
        target.style.setProperty("--bx", (horizontal - 0.5) * 6 + "px");
        target.style.setProperty("--by", (vertical - 0.5) * 4 + "px");
      }
    };
    const move = (event: PointerEvent) => {
      if (!finePointer.matches || !(event.target instanceof Element)) return;
      const target = event.target.closest<HTMLElement>(".fig, .btn");
      if (!target || !element.contains(target)) return;
      pending = { target, x: event.clientX, y: event.clientY };
      if (frame === null) frame = window.requestAnimationFrame(paint);
    };
    const leave = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const target = event.target.closest<HTMLElement>(".fig, .btn");
      if (!target || (event.relatedTarget instanceof Node && target.contains(event.relatedTarget))) return;
      if (pending?.target === target) pending = null;
      reset(target);
    };
    element.addEventListener("pointermove", move, { passive: true });
    element.addEventListener("pointerout", leave, { passive: true });
    return () => {
      element.removeEventListener("pointermove", move); element.removeEventListener("pointerout", leave);
      if (frame !== null) window.cancelAnimationFrame(frame);
      touched.forEach(reset);
    };
  }, [motionPaused, root]);

  useEffect(() => {
    const element = root.current;
    if (!element || hidden) return;
    const hero = element.querySelector<HTMLElement>(".hero");
    const mark = element.querySelector<HTMLElement>(".mark");
    const progress = element.querySelector<HTMLElement>(".prog");
    const toTop = element.querySelector<HTMLElement>(".totop");
    const sections = [...element.querySelectorAll<HTMLElement>("section[id]")];
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    let frame: number | null = null;
    let pointer: { x: number; y: number } | null = null;
    const paint = () => {
      frame = null;
      const y = window.scrollY;
      const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      progress?.style.setProperty("--s", String(Math.min(1, Math.max(0, y / max))));
      toTop?.classList.toggle("show", y > window.innerHeight * 1.2);
      let current = "top";
      for (const section of sections) if (section.getBoundingClientRect().top <= window.innerHeight * 0.5) current = section.id;
      if (y < 120) current = "top";
      setActiveSection(previous => previous === current ? previous : current);
      if (paused || !hero) return;
      const height = Math.max(1, hero.offsetHeight);
      mark?.style.setProperty("--p", Math.min(y, height) * 0.22 + "px");
      mark?.style.setProperty("--o", String(1 - Math.min(y, height) / height * 0.75));
      if (pointer && finePointer.matches) {
        const box = hero.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, (pointer.x - box.left) / box.width * 100));
        const py = Math.max(0, Math.min(100, (pointer.y - box.top) / box.height * 100));
        hero.style.setProperty("--mx", x + "%"); hero.style.setProperty("--my", py + "%");
        mark?.style.setProperty("--rx", (x - 50) * -0.32 + "px");
        mark?.style.setProperty("--ry", (py - 50) * -0.32 + "px");
        setCoordinateLabel(`LOC ${Math.round(x).toString().padStart(2, "0")}·${Math.round(py).toString().padStart(2, "0")}`);
      }
    };
    const schedule = () => { if (frame === null) frame = window.requestAnimationFrame(paint); };
    const move = (event: PointerEvent) => { if (paused || !finePointer.matches) return; pointer = { x: event.clientX, y: event.clientY }; schedule(); };
    const leave = () => {
      pointer = null; setCoordinateLabel("SQR // 2026");
      for (const name of ["--rx", "--ry"]) mark?.style.removeProperty(name);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    hero?.addEventListener("pointermove", move, { passive: true });
    hero?.addEventListener("pointerleave", leave);
    schedule();
    return () => {
      window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule);
      hero?.removeEventListener("pointermove", move); hero?.removeEventListener("pointerleave", leave);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [hidden, paused, root]);

  return { theme, toggleTheme, menuOpen, setMenuOpen, activeSection, replay, boostedFigure, replayVersion, coordinateLabel, motionPaused };
}
