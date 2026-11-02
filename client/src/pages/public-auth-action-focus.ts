/** Follow an explicit action without taking focus back from another control. */
export function beginPublicAuthActionFocus(ownerDocument: Document = document) {
  const origin = ownerDocument.activeElement;
  let moved = false;
  let finished = false;
  const onFocus = (event: FocusEvent) => {
    if (event.target !== origin && event.target !== ownerDocument.body) moved = true;
  };
  ownerDocument.addEventListener("focusin", onFocus);
  const cancel = () => {
    finished = true;
    ownerDocument.removeEventListener("focusin", onFocus);
  };
  return {
    cancel,
    complete(target: HTMLElement | null, options: { revealIfNeeded?: boolean } = {}) {
      if (finished) return;
      const active = ownerDocument.activeElement;
      const canFollow = !moved && (active === origin || active === ownerDocument.body);
      cancel();
      if (canFollow && target?.isConnected && !target.matches(":disabled")) {
        target.focus({ preventScroll: true });
        if (options.revealIfNeeded && target.isConnected) {
          const view = ownerDocument.defaultView;
          const viewport = view?.visualViewport;
          const top = viewport?.offsetTop ?? 0;
          const left = viewport?.offsetLeft ?? 0;
          const height = viewport?.height ?? view?.innerHeight ?? 0;
          const width = viewport?.width ?? view?.innerWidth ?? 0;
          const bounds = target.getBoundingClientRect();
          if (height > 0 && width > 0 && (bounds.top < top || bounds.bottom > top + height
            || bounds.left < left || bounds.right > left + width)) {
            target.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "instant" });
          }
        }
      }
    },
  };
}
