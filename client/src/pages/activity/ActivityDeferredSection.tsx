import { startTransition, useEffect, useRef, useState } from "react";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";

export function ActivitySectionFallback({ label }: { label: string }) {
  return (
    <OperationalSectionCard className="bg-background/80" contentClassName="p-4 text-sm text-muted-foreground">
      <div role="status" aria-live="polite">
        {label}
      </div>
    </OperationalSectionCard>
  );
}

type DeferredActivitySectionOptions = {
  enabled: boolean;
  rootMargin?: string;
  timeoutMs?: number;
};

export function useDeferredActivitySectionMount({
  enabled,
  rootMargin = "280px 0px",
  timeoutMs = 1200,
}: DeferredActivitySectionOptions) {
  const triggerRef = useRef<HTMLDivElement | null>(null);
  const [shouldRender, setShouldRender] = useState(() => !enabled);

  useEffect(() => {
    if (!enabled) {
      setShouldRender(true);
      return;
    }

    if (shouldRender) {
      return;
    }

    let cancelled = false;
    let observer: IntersectionObserver | null = null;
    let timeoutHandle: number | null = null;

    const markReady = () => {
      if (cancelled) {
        return;
      }

      startTransition(() => {
        setShouldRender(true);
      });
    };

    if (typeof window.IntersectionObserver === "function" && triggerRef.current) {
      observer = new window.IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) {
            return;
          }

          observer?.disconnect();
          observer = null;
          markReady();
        },
        {
          rootMargin,
        },
      );
      observer.observe(triggerRef.current);
    } else {
      timeoutHandle = window.setTimeout(markReady, timeoutMs);
    }

    return () => {
      cancelled = true;
      observer?.disconnect();
      observer = null;
      if (timeoutHandle !== null) {
        window.clearTimeout(timeoutHandle);
      }
    };
  }, [enabled, rootMargin, shouldRender, timeoutMs]);

  return { shouldRender, triggerRef };
}
