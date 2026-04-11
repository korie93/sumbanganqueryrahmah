import { useEffect, useRef, useState, type ReactNode, type UIEventHandler } from "react";
import { cn } from "@/lib/utils";

type HorizontalScrollHintProps = {
  children: ReactNode;
  className?: string;
  viewportClassName?: string;
  hint?: string;
  onScroll?: UIEventHandler<HTMLDivElement>;
};

type HorizontalOverflowState = {
  canScroll: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
};

export function HorizontalScrollHint({
  children,
  className,
  viewportClassName,
  hint = "Scroll for more",
  onScroll,
}: HorizontalScrollHintProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [overflowState, setOverflowState] = useState<HorizontalOverflowState>({
    canScroll: false,
    canScrollLeft: false,
    canScrollRight: false,
  });

  useEffect(() => {
    const viewportNode = viewportRef.current;

    if (!viewportNode || typeof window === "undefined") {
      return;
    }

    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;

    const updateOverflowState = () => {
      frame = 0;

      const maxScrollLeft = Math.max(0, viewportNode.scrollWidth - viewportNode.clientWidth);
      const nextState = {
        canScroll: maxScrollLeft > 12,
        canScrollLeft: viewportNode.scrollLeft > 8,
        canScrollRight: maxScrollLeft - viewportNode.scrollLeft > 8,
      };

      setOverflowState((previous) => (
        previous.canScroll === nextState.canScroll
        && previous.canScrollLeft === nextState.canScrollLeft
        && previous.canScrollRight === nextState.canScrollRight
      ) ? previous : nextState);
    };

    const scheduleOverflowUpdate = () => {
      if (frame !== 0) {
        return;
      }

      frame = window.requestAnimationFrame(updateOverflowState);
    };

    scheduleOverflowUpdate();
    viewportNode.addEventListener("scroll", scheduleOverflowUpdate, { passive: true });
    window.addEventListener("resize", scheduleOverflowUpdate);

    if (typeof ResizeObserver === "function") {
      resizeObserver = new ResizeObserver(() => {
        scheduleOverflowUpdate();
      });
      resizeObserver.observe(viewportNode);
    }

    return () => {
      viewportNode.removeEventListener("scroll", scheduleOverflowUpdate);
      window.removeEventListener("resize", scheduleOverflowUpdate);
      resizeObserver?.disconnect();

      if (frame !== 0) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, [children]);

  return (
    <div className={cn("relative", className)}>
      <div
        ref={viewportRef}
        className={cn("overflow-x-auto", viewportClassName)}
        onScroll={onScroll}
      >
        {children}
      </div>
      {overflowState.canScroll ? (
        <>
          <div
            className={cn(
              "pointer-events-none absolute bottom-1 left-0 top-0 w-8 rounded-l-full bg-linear-to-r from-background/95 to-background/0 opacity-0 transition-opacity duration-200",
              overflowState.canScrollLeft ? "opacity-100" : "",
            )}
            aria-hidden="true"
          />
          <div
            className={cn(
              "pointer-events-none absolute bottom-1 right-0 top-0 w-8 rounded-r-full bg-linear-to-l from-background/95 to-background/0 opacity-0 transition-opacity duration-200",
              overflowState.canScrollRight ? "opacity-100" : "",
            )}
            aria-hidden="true"
          />
          {overflowState.canScrollRight ? (
            <div
              className="pointer-events-none absolute right-1 top-1/2 z-[1] -translate-y-1/2 rounded-full border border-border/70 bg-background/92 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground shadow-sm"
              aria-hidden="true"
            >
              {hint}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
