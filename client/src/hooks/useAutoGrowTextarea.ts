import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
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
  { minRows = 2, maxRows = 5, layoutKey }: AutoGrowTextareaOptions & { layoutKey?: number | undefined } = {},
) {
  const lastMeasurement = useRef<{ element: HTMLTextAreaElement; value: string; geometry: string } | null>(null);
  const resize = useCallback((valueChanged = false) => {
    const textarea = textareaRef.current;
    const view = textarea?.ownerDocument.defaultView;
    if (!textarea || !view) { lastMeasurement.current = null; return; }
    const width = textarea.getBoundingClientRect().width;
    if (width === 0) { lastMeasurement.current = null; return; }
    const computed = view.getComputedStyle(textarea);
    const scrollTop = textarea.scrollTop;
    // Read sizing styles before changing height. The fingerprint also invalidates
    // the append path when CSS/font metrics change without a window resize.
    const metrics = {
      lineHeight: pixels(computed.lineHeight, pixels(computed.fontSize, 16) * 1.5),
      padding: pixels(computed.paddingTop) + pixels(computed.paddingBottom),
      border: pixels(computed.borderTopWidth) + pixels(computed.borderBottomWidth),
      boxSizing: computed.boxSizing === "content-box" ? "content-box" as const : "border-box" as const,
      minHeight: pixels(computed.minHeight),
      maxHeight: pixels(computed.maxHeight, Infinity),
    };
    const geometry = [width, ...Object.values(metrics), computed.font, computed.letterSpacing,
      computed.wordSpacing, computed.paddingLeft, computed.paddingRight, computed.whiteSpace,
      computed.wordBreak, computed.overflowWrap, computed.tabSize, computed.textIndent,
      computed.textTransform, computed.writingMode, computed.fontFeatureSettings,
      computed.fontVariationSettings, computed.fontKerning].join("\0");
    const previous = lastMeasurement.current;
    // Keep the measured minimum-height box when simple appended text still
    // fits. Growing/wrapped input and other edits retain the full measurement,
    // including shrinking and Unicode shaping/combining sequences.
    const appendOnly = valueChanged && previous?.element === textarea
      && previous.geometry === geometry && textarea.value.startsWith(previous.value)
      && /^[\t\n\r\u0020-\u007e]*$/.test(textarea.value);
    const minimum = getAutoGrowTextareaSize({ ...metrics, scrollHeight: 0 }, { minRows, maxRows }).height;
    if (appendOnly && textarea.style.height === `${minimum}px`
      && textarea.scrollHeight <= textarea.clientHeight + 1) {
      lastMeasurement.current = { element: textarea, value: textarea.value, geometry };
      return;
    }
    // Individual CSSOM properties preserve strict CSP without a stylesheet.
    textarea.style.overflowY = "hidden";
    textarea.style.height = "0px";
    const size = getAutoGrowTextareaSize({ ...metrics, scrollHeight: textarea.scrollHeight }, { minRows, maxRows });
    const height = `${size.height}px`;
    if (textarea.style.height !== height) textarea.style.height = height;
    // The actual box remains authoritative if CSS min()/max()/clamp() did not
    // resolve to a pixel value in getComputedStyle (or viewport CSS caps it).
    const overflow = textarea.scrollHeight > textarea.clientHeight + 1 ? "auto" : "hidden";
    if (textarea.style.overflowY !== overflow) textarea.style.overflowY = overflow;
    textarea.scrollTop = Math.min(scrollTop, Math.max(0, textarea.scrollHeight - textarea.clientHeight));
    lastMeasurement.current = { element: textarea, value: textarea.value, geometry };
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
      lastMeasurement.current = null;
    };
  }, [resize, textareaRef]);

  // Inherited viewport caps can settle in a parent render after the viewport
  // event. Remeasure after that commit, even when the textarea width is stable.
  useBrowserLayoutEffect(() => resize(true), [resize, value, layoutKey]);
}
