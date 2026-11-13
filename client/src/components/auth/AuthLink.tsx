import { useEffect, useRef, type AnchorHTMLAttributes } from "react";
import {
  beginAuthNavigationIntent,
  markPublicAuthArrival,
  preloadAuthNavigation,
  type AuthNavigationIntent,
} from "@/lib/auth-navigation-preload";
import { withViewTransition, type ViewTransitionKind } from "@/lib/view-transition";

type AuthLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: string;
  onNavigate: () => void;
  kind?: ViewTransitionKind;
};

/** Native anchor semantics with existing SPA callbacks for ordinary activation. */
export function AuthLink({ to, onNavigate, kind = "auth", onClick, target, download, ...props }: AuthLinkProps) {
  const mounted = useRef(true);
  const pendingIntent = useRef<AuthNavigationIntent | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      pendingIntent.current?.cancel();
    };
  }, []);

  return <a {...props} href={to} target={target} download={download} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey
      || event.shiftKey || event.altKey || (target && target.toLowerCase() !== "_self")
      || (download != null && download !== false)) return;
    event.preventDefault();
    pendingIntent.current?.cancel();
    const intent = beginAuthNavigationIntent();
    pendingIntent.current = intent;
    const navigate = () => {
      if (!mounted.current || !intent.isCurrent()) return;
      return withViewTransition(() => {
        if (mounted.current && intent.isCurrent()) {
          markPublicAuthArrival();
          onNavigate();
        }
      }, kind);
    };
    // The existing route error boundary owns failed chunks. Still navigate on
    // failure so its retry UI remains reachable; preserve the original callback.
    void preloadAuthNavigation(to).then(navigate, navigate);
  }} />;
}
