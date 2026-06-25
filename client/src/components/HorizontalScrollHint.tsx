import { useEffect, useRef, useState, type ReactNode, type UIEventHandler } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { translate } from "@/lib/i18n";
import { cn } from "@/lib/utils";

type HorizontalScrollHintProps = {
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  viewportClassName?: string;
  hint?: string;
  navigationLabel?: string;
  onScroll?: UIEventHandler<HTMLDivElement>;
  showNavigationControls?: boolean;
  showScrollbar?: boolean;
};

type HorizontalOverflowState = {
  canScroll: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  scrollPercent: number;
};

/**
 * Renders the shared horizontal scroll hint component used across SQR screens.
 */
export function HorizontalScrollHint({
  ariaLabel,
  children,
  className,
  viewportClassName,
  hint = translate("common.horizontalScroll.hint"),
  navigationLabel = "Horizontal column navigation",
  onScroll,
  showNavigationControls = false,
  showScrollbar = false,
}: HorizontalScrollHintProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [overflowState, setOverflowState] = useState<HorizontalOverflowState>({
    canScroll: false,
    canScrollLeft: false,
    canScrollRight: false,
    scrollPercent: 0,
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
      const scrollPercent = maxScrollLeft > 0
        ? Math.round((viewportNode.scrollLeft / maxScrollLeft) * 100)
        : 0;
      const nextState = {
        canScroll: maxScrollLeft > 12,
        canScrollLeft: viewportNode.scrollLeft > 8,
        canScrollRight: maxScrollLeft - viewportNode.scrollLeft > 8,
        scrollPercent: Math.min(100, Math.max(0, scrollPercent)),
      };

      setOverflowState((previous) => (
        previous.canScroll === nextState.canScroll
        && previous.canScrollLeft === nextState.canScrollLeft
        && previous.canScrollRight === nextState.canScrollRight
        && previous.scrollPercent === nextState.scrollPercent
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

  const scrollByViewport = (direction: -1 | 1) => {
    const viewportNode = viewportRef.current;
    if (!viewportNode) {
      return;
    }

    const maxScrollLeft = Math.max(0, viewportNode.scrollWidth - viewportNode.clientWidth);
    const distance = Math.max(240, Math.round(viewportNode.clientWidth * 0.75));
    const nextScrollLeft = Math.min(
      maxScrollLeft,
      Math.max(0, viewportNode.scrollLeft + (distance * direction)),
    );

    viewportNode.scrollTo({
      left: nextScrollLeft,
      behavior: "auto",
    });
  };

  const scrollToBoundary = (boundary: "start" | "end") => {
    const viewportNode = viewportRef.current;
    if (!viewportNode) {
      return;
    }

    viewportNode.scrollTo({
      left: boundary === "start"
        ? 0
        : Math.max(0, viewportNode.scrollWidth - viewportNode.clientWidth),
      behavior: "auto",
    });
  };

  return (
    <div className={cn("relative", className)}>
      {showNavigationControls && overflowState.canScroll ? (
        <div
          className="mb-2 flex items-center justify-end gap-1"
          role="group"
          aria-label={navigationLabel}
          data-testid="horizontal-scroll-navigation"
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 min-w-8"
            aria-label="Jump to first column"
            disabled={!overflowState.canScrollLeft}
            onClick={() => scrollToBoundary("start")}
          >
            <ChevronsLeft aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 min-w-8"
            aria-label="Scroll columns left"
            disabled={!overflowState.canScrollLeft}
            onClick={() => scrollByViewport(-1)}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <span
            className="min-w-11 text-center text-2xs font-semibold tabular-nums text-muted-foreground"
            role="progressbar"
            aria-label="Horizontal table position"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={overflowState.scrollPercent}
            data-testid="horizontal-scroll-position"
          >
            {overflowState.scrollPercent}%
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 min-w-8"
            aria-label="Scroll columns right"
            disabled={!overflowState.canScrollRight}
            onClick={() => scrollByViewport(1)}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-8 w-8 min-w-8"
            aria-label="Jump to last column"
            disabled={!overflowState.canScrollRight}
            onClick={() => scrollToBoundary("end")}
          >
            <ChevronsRight aria-hidden="true" />
          </Button>
        </div>
      ) : null}
      <div
        ref={viewportRef}
        aria-label={ariaLabel}
        className={cn(
          "horizontal-scroll-hint overflow-x-auto",
          showScrollbar ? "horizontal-scroll-hint--visible scrollbar-visible" : "",
          viewportClassName,
        )}
        onScroll={onScroll}
        role={ariaLabel ? "region" : undefined}
        tabIndex={ariaLabel ? 0 : undefined}
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
              className="pointer-events-none absolute right-1 top-1/2 z-[var(--z-inline-overlay)] -translate-y-1/2 rounded-full border border-border/70 bg-background/92 px-2 py-1 text-xxs font-semibold uppercase tracking-label-md text-muted-foreground shadow-sm"
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
