import { useEffect, useRef, useState } from "react";
import "./SidebarAnimatedQ.css";

const LAYERS = ["body", "dot-1", "dot-2", "dot-3", "dot-4", "sheen"] as const;
const ALL_LOADED = (1 << LAYERS.length) - 1;

/** Mounted only for the collapsed desktop rail. Motion never drives React frames. */
export function SidebarAnimatedQ() {
  const artworkRef = useRef<HTMLSpanElement>(null);
  const [loaded, setLoaded] = useState(0);
  const [failed, setFailed] = useState(false);
  const [motion, setMotion] = useState({ visible: false, reduced: true });

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let intersecting = false;
    const update = () => {
      const next = { visible: intersecting && document.visibilityState === "visible", reduced: media.matches };
      setMotion(current => current.visible === next.visible && current.reduced === next.reduced ? current : next);
    };
    // Without observation support, keep the genuine static artwork as a safe fallback.
    const observer = typeof IntersectionObserver === "function" ? new IntersectionObserver(entries => {
      intersecting = entries.some(entry => entry.isIntersecting);
      update();
    }) : null;
    if (artworkRef.current) observer?.observe(artworkRef.current);
    update();
    media.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer?.disconnect();
      media.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  const ready = loaded === ALL_LOADED && !failed;
  const state = !ready ? "static" : motion.reduced ? "reduced" : motion.visible ? "playing" : "paused";
  return (
    <span ref={artworkRef} className="workspace-sidebar-toggle-logo sidebar-q-artwork"
      aria-hidden="true" data-motion={state} data-ready={ready ? "true" : "false"}>
      <img className="sidebar-q-static" src="/brand/sidebar-q-static.png"
        width={128} height={128} alt="" decoding="async" draggable={false} />
      {!failed && <span className="sidebar-q-layers">
        {LAYERS.map((layer, index) => {
          const image = <img key={layer} src={`/brand/sidebar-q-${layer}.png`} width={128} height={128}
            className={layer.startsWith("dot") ? `sidebar-q-dot sidebar-q-${layer}` : `sidebar-q-${layer}`}
            alt="" decoding="async" draggable={false}
            onLoad={() => setLoaded(current => current | (1 << index))}
            onError={() => setFailed(true)} />;
          return layer === "sheen" ? <span key={layer} className="sidebar-q-sheen-clip">{image}</span>
            : image;
        })}
      </span>}
    </span>
  );
}
