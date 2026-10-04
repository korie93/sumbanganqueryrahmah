import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { AnalysisPreview, OverviewPreview, PreviewSidebar, SearchPreview } from "./PreviewViews";
import { useOnScreen } from "./useLandingMotion";
import { getAriaPressedProps, getAriaSelectedProps } from "@/lib/aria-state-props";

const previews = [
  { name: "overview", label: "Overview", title: "Dashboard", View: OverviewPreview },
  { name: "search", label: "General Search", title: "General Search", View: SearchPreview },
  { name: "analysis", label: "Analysis", title: "Analysis", View: AnalysisPreview },
] as const;

export function ProductPreview({ motionPaused }: { motionPaused: boolean }) {
  const [active, setActive] = useState(0);
  const [manualPause, setManualPause] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const shell = useRef<HTMLDivElement>(null);
  const tabs = useRef<Array<HTMLButtonElement | null>>([]);
  const visible = useOnScreen(shell);
  const paused = motionPaused || manualPause || hovered || focused || !visible;
  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(() => setActive(index => (index + 1) % previews.length), 5600);
    return () => window.clearInterval(timer);
  }, [paused, active]);
  const onBlur = (event: FocusEvent<HTMLDivElement>) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); };
  const select = (index: number) => { setManualPause(true); setActive(index); };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3
      : event.key === "Home" ? 0 : event.key === "End" ? 2 : null;
    if (next === null) return;
    event.preventDefault(); select(next); tabs.current[next]?.focus();
  };
  return (
    <div className="preview-interaction" onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)} onFocusCapture={() => setFocused(true)} onBlurCapture={onBlur}>
      <div className={`showcase-tabs${paused ? " autoplay-paused" : ""}`} role="tablist" aria-label="SQR product preview">
        {previews.map((preview, index) => (
          <button key={preview.name} ref={element => { tabs.current[index] = element; }} type="button" className="showcase-tab"
            id={`tab-${preview.name}`} role="tab" {...getAriaSelectedProps(active === index)} aria-controls={`view-${preview.name}`}
            tabIndex={active === index ? 0 : -1} onClick={() => select(index)} onKeyDown={event => onKeyDown(event, index)}>{preview.label}</button>
        ))}
      </div>
      <button type="button" className="preview-pause-toggle" {...getAriaPressedProps(manualPause)} aria-label={manualPause ? "Resume automatic preview" : "Pause automatic preview"} onClick={() => setManualPause(value => !value)}>
        <span aria-hidden="true">{manualPause ? "▶" : "⏸"}</span><span className="sr-only pause-label">{manualPause ? "Resume automatic preview" : "Pause automatic preview"}</span>
      </button>
      <div className="preview-disclaimer"><span className="preview-live-dot" aria-hidden="true" /><b>Interactive Product Preview</b></div>
      <div className={`product-shell ${paused ? "is-idle" : "preview-running"}`} id="product-preview" ref={shell} tabIndex={-1}>
        <div className="appbar"><div className="traffic" aria-hidden="true"><i /><i /><i /></div><div className="app-title">SQR — {previews[active].title}</div></div>
        <div className="app"><PreviewSidebar /><div className="main">
          {previews.map(({ name, View }, index) => (
            <div key={name} className={`preview-view motion-ready${active === index ? " is-active tab-enter" : ""}`} id={`view-${name}`} role="tabpanel" aria-labelledby={`tab-${name}`} hidden={active !== index} tabIndex={0}>
              {/* Keep every tab's ARIA target, but only build the visible demo. */}
              {active === index && <View />}
            </div>
          ))}
        </div></div>
      </div>
    </div>
  );
}
