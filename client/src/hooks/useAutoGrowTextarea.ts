import { useCallback, useEffect, useLayoutEffect, type RefObject } from "react";
import { getAutoGrowTextareaSize, type AutoGrowTextareaOptions } from "./auto-grow-textarea";

const useBrowserLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const pixels = (value: string, fallback = 0) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Grow only the composer, never the transcript; cap long input and shrink on clear. */
export function useAutoGrowTextarea(
  textareaRef: RefObject<HTMLTextAreaElement | null>,
  value: string,
  { minRows = 2, maxRows = 5 }: AutoGrowTextareaOptions = {},
) {
  const resize = useCallback(() => {
    const textarea = textareaRef.current;
    const view = textarea?.ownerDocument.defaultView;
    if (!textarea || !view || textarea.getBoundingClientRect().width === 0) return;
    const computed = view.getComputedStyle(textarea);
    const scrollTop = textarea.scrollTop;
    // Remove our previous height before measuring so deleting/resetting can shrink.
    // Individual CSSOM properties preserve strict CSP without injected stylesheets.
    textarea.style.overflowY = "hidden";
    textarea.style.height = "0px";
    const size = getAutoGrowTextareaSize({
      scrollHeight: textarea.scrollHeight,
      lineHeight: pixels(computed.lineHeight, pixels(computed.fontSize, 16) * 1.5),
      padding: pixels(computed.paddingTop) + pixels(computed.paddingBottom),
      border: pixels(computed.borderTopWidth) + pixels(computed.borderBottomWidth),
      boxSizing: computed.boxSizing === "content-box" ? "content-box" : "border-box",
      minHeight: pixels(computed.minHeight),
      maxHeight: pixels(computed.maxHeight, Infinity),
    }, { minRows, maxRows });
    textarea.style.height = `${size.height}px`;
    // The actual box remains authoritative if CSS min()/max()/clamp() did not
    // resolve to a pixel value in getComputedStyle (or viewport CSS caps it).
    textarea.style.overflowY = textarea.scrollHeight > textarea.clientHeight + 1 ? "auto" : "hidden";
    textarea.scrollTop = Math.min(scrollTop, Math.max(0, textarea.scrollHeight - textarea.clientHeight));
  }, [maxRows, minRows, textareaRef]);

  useBrowserLayoutEffect(() => {
    const textarea = textareaRef.current;
    const view = textarea?.ownerDocument.defaultView;
    if (!textarea || !view) return;
    const previousHeight = textarea.style.height;
    const previousOverflow = textarea.style.overflowY;
    let width = textarea.getBoundingClientRect().width;
    let frame: number | null = null;
    let disposed = false;
    const scheduleResize = () => {
      if (disposed || frame !== null) return;
      frame = view.requestAnimationFrame(() => {
        frame = null;
        if (!disposed) resize();
      });
    };
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => {
      // Height and scrollbar changes must not retrigger auto-grow. Compare outer
      // width because a scrollbar can change the observed content-box width.
      const nextWidth = textarea.getBoundingClientRect().width;
      if (nextWidth === width) return;
      width = nextWidth;
      scheduleResize();
    });
    observer?.observe(textarea);
    view.addEventListener("resize", scheduleResize);
    view.visualViewport?.addEventListener("resize", scheduleResize);
    const fonts = textarea.ownerDocument.fonts;
    fonts?.addEventListener("loadingdone", scheduleResize);
    void fonts?.ready.then(scheduleResize);
    return () => {
      disposed = true;
      if (frame !== null) view.cancelAnimationFrame(frame);
      observer?.disconnect();
      view.removeEventListener("resize", scheduleResize);
      view.visualViewport?.removeEventListener("resize", scheduleResize);
      fonts?.removeEventListener("loadingdone", scheduleResize);
      textarea.style.height = previousHeight;
      textarea.style.overflowY = previousOverflow;
    };
  }, [resize, textareaRef]);

  useBrowserLayoutEffect(resize, [resize, value]);
}
