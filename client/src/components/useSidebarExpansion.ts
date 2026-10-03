import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/** Defer anchored layers until the expanded rail has stopped moving. */
export function useSidebarExpansion(
  collapsed: boolean,
  onCollapsedChange: ((collapsed: boolean) => void) | undefined,
  sidebarRef: RefObject<HTMLElement>,
) {
  const pendingAction = useRef<(() => void) | null>(null);
  const frame = useRef<number | null>(null);
  const [requestVersion, setRequestVersion] = useState(0);
  const cancel = useCallback(() => {
    pendingAction.current = null;
    if (frame.current !== null) window.cancelAnimationFrame(frame.current);
    frame.current = null;
  }, []);

  useEffect(() => {
    if (collapsed || !pendingAction.current) return;
    let previousWidth = -1;
    let stableFrames = 0;
    const started = performance.now();
    const settle = () => {
      const width = sidebarRef.current?.getBoundingClientRect().width ?? 0;
      if (width <= 0) { cancel(); return; }
      stableFrames = Math.abs(width - previousWidth) < 0.25 ? stableFrames + 1 : 0;
      previousWidth = width;
      if (stableFrames >= 2 || performance.now() - started >= 650) {
        const action = pendingAction.current;
        pendingAction.current = null;
        frame.current = null;
        action?.();
        return;
      }
      frame.current = window.requestAnimationFrame(settle);
    };
    frame.current = window.requestAnimationFrame(settle);
    return () => {
      if (frame.current !== null) window.cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [cancel, collapsed, requestVersion, sidebarRef]);

  useEffect(() => cancel, [cancel]);
  const afterExpansion = useCallback((action: () => void) => {
    cancel();
    const sidebar = sidebarRef.current;
    const targetWidth = sidebar ? Number.parseFloat(getComputedStyle(sidebar).getPropertyValue("--workspace-sidebar-width")) : 0;
    const width = sidebar?.getBoundingClientRect().width ?? 0;
    if (!collapsed && width > 0 && Math.abs(width - targetWidth) < 0.5) { action(); return; }
    pendingAction.current = action;
    if (collapsed) onCollapsedChange?.(false);
    setRequestVersion((current) => current + 1);
  }, [cancel, collapsed, onCollapsedChange, sidebarRef]);
  return { afterExpansion, cancelExpansion: cancel };
}
