import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import signinLight from "@/assets/auth-v17/sqr-illustration.webp";
import signinDark from "@/assets/auth-v17/sqr-illustration-dark.webp";
import "./AuthBrandArtwork.css";

type Variant = "signin" | "recovery";
type Frame = { src: string; width: number; height: number };
type Frames = Record<Variant, Frame>;
type Props = { theme: "light" | "dark"; recoveryArtwork: boolean };
const variants: Variant[] = ["signin", "recovery"];

function artwork(theme: Props["theme"]): Frames {
  return {
    signin: theme === "dark" ? { src: signinDark, width: 1359, height: 1157 }
      : { src: signinLight, width: 1780, height: 1516 },
    recovery: { src: `/illustrations/reset-password-${theme}.webp`, width: 640, height: 640 },
  };
}

/** Keeps both decorative scenes mounted and retains decoded art while a replacement loads. */
export function AuthBrandArtwork({ theme, recoveryArtwork }: Props) {
  const desired = useMemo(() => artwork(theme), [theme]);
  const variant: Variant = recoveryArtwork ? "recovery" : "signin";
  const [frames, setFrames] = useState<Frames>(() => desired);
  // A reserved empty frame fades into its first decoded scene rather than
  // exposing an opaque image before the browser finishes loading it.
  const [active, setActive] = useState<Variant | null>(null);
  const mounted = useRef(true);
  const decoded = useRef(new Set<string>());
  const failed = useRef(new Set<string>());
  const renderedImages = useRef<Record<Variant, HTMLImageElement | null>>({ signin: null, recovery: null });
  const previousTheme = useRef(theme);
  const requested = useRef({ frames: desired, rendered: frames, variant });
  requested.current = { frames: desired, rendered: frames, variant };

  const ready = useCallback((name: Variant, src: string) => {
    if (!mounted.current) return;
    decoded.current.add(src);
    failed.current.delete(src);
    if (requested.current.variant === name && requested.current.frames[name].src === src) setActive(name);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (frames[variant].src === desired[variant].src && decoded.current.has(frames[variant].src)) setActive(variant);
  }, [desired, frames, variant]);

  useEffect(() => {
    let cancelled = false;
    const explicitThemeVisit = previousTheme.current !== theme;
    previousTheme.current = theme;
    const loaders: HTMLImageElement[] = [];
    for (const name of variants) {
      const frame = desired[name];
      // The rendered images own the first load. Later theme assets decode off
      // screen so changing src cannot erase the last complete visible scene.
      if (requested.current.rendered[name].src === frame.src) {
        // A later theme visit may retry an initially failed node in place.
        // Renders and failures themselves never schedule another attempt.
        const image = renderedImages.current[name];
        if (explicitThemeVisit && image && failed.current.delete(frame.src)) image.src = frame.src;
        continue;
      }
      if (decoded.current.has(frame.src)) {
        setFrames(previous => ({ ...previous, [name]: frame }));
        ready(name, frame.src);
        continue;
      }
      const image = new Image();
      failed.current.delete(frame.src);
      image.decoding = "async";
      image.fetchPriority = "low";
      image.onload = () => {
        void image.decode().then(() => {
          if (cancelled || !mounted.current || !image.naturalWidth) return;
          setFrames(previous => ({ ...previous, [name]: frame }));
          ready(name, frame.src);
        }, () => { if (!cancelled) failed.current.add(frame.src); });
      };
      image.onerror = () => { if (!cancelled) failed.current.add(frame.src); };
      image.src = frame.src;
      loaders.push(image);
    }
    return () => {
      cancelled = true;
      for (const image of loaders) { image.onload = null; image.onerror = null; }
    };
    // Retain in-flight decodes when the other layer finishes or the route changes.
  }, [desired, ready, theme]);

  const loaded = (name: Variant, src: string, image: HTMLImageElement) => {
    void image.decode().then(() => {
      if (image.isConnected && image.complete && image.naturalWidth && image.src === new URL(src, document.baseURI).href) ready(name, src);
    }, () => { failed.current.add(src); });
  };

  return <div className="auth-v17-art auth-brand-artwork" aria-hidden="true">
    {variants.map(name => <img
      key={name}
      ref={image => { renderedImages.current[name] = image; }}
      className={name === "recovery" ? "auth-v17-recovery-illustration" : "auth-v17-signin-illustration"}
      src={frames[name].src}
      width={frames[name].width}
      height={frames[name].height}
      alt=""
      aria-hidden="true"
      loading="eager"
      decoding="async"
      {...{ fetchpriority: "low" }}
      data-active={active === name}
      onLoad={event => loaded(name, frames[name].src, event.currentTarget)}
      onError={() => { failed.current.add(frames[name].src); }}
    />)}
  </div>;
}
