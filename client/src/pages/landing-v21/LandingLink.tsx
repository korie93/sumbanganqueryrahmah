import { createContext, useContext, type ComponentProps } from "react";

export const LandingNavigationContext = createContext({ onLoginClick: () => {}, reducedMotion: true });

/** Keep genuine hrefs for keyboard activation, modified clicks and open-in-new-tab. */
export function LandingLink({ href, children, onClick, ...props }: ComponentProps<"a"> & { href: string }) {
  const { onLoginClick, reducedMotion } = useContext(LandingNavigationContext);
  return <a {...props} href={href} onClick={event => {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (href === "/login") { event.preventDefault(); onLoginClick(); return; }
    if (!href.startsWith("#")) return;
    const root = event.currentTarget.closest(".sqr-landing");
    const target = [...(root?.querySelectorAll<HTMLElement>("[id]") ?? [])].find(element => `#${element.id}` === href);
    if (!target) return;
    event.preventDefault();
    target.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: "start", behavior: reducedMotion ? "instant" : "smooth" });
    window.history.replaceState(null, "", href);
  }}>{children}</a>;
}
