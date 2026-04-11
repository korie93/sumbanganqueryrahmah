import { startTransition, useEffect, useRef, useState } from "react";
import { OperationalSectionCard } from "@/components/layout/OperationalPage";

const DEFERRED_ACTIVITY_SECTION_ROOT_MARGIN_DEFAULT = "280px 0px";
const DEFERRED_ACTIVITY_SECTION_TIMEOUT_MS_DEFAULT = 1_200;

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
  rootMargin = DEFERRED_ACTIVITY_SECTION_ROOT_MARGIN_DEFAULT,
  timeoutMs = DEFERRED_ACTIVITY_SECTION_TIMEOUT_MS_DEFAULT,
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
