import { ChevronDown, ChevronUp } from "lucide-react";
import { startTransition, useEffect, useRef, useState, type ReactNode } from "react";
import {
  OperationalSectionCard,
} from "@/components/layout/OperationalPage";
import { Badge } from "@/components/ui/badge";

export function getMonitorSummaryToneClass(tone: "stable" | "watch" | "attention") {
  if (tone === "attention") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }

  if (tone === "watch") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }

  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
}

export function MonitorChartsFallback() {
  return (
    <OperationalSectionCard className="bg-background/80" contentClassName="space-y-4 p-4">
      <div role="status" aria-live="polite" aria-label="Loading technical charts" className="space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-slate-300/70 dark:bg-slate-700/70" />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-64 animate-pulse rounded-xl bg-slate-300/60 dark:bg-slate-800/70"
            />
          ))}
        </div>
      </div>
    </OperationalSectionCard>
  );
}

export function MonitorInsightsFallback() {
  return (
    <OperationalSectionCard className="bg-background/80" contentClassName="space-y-4 p-4">
      <div role="status" aria-live="polite" aria-label="Loading intelligence insights" className="space-y-4">
        <div className="space-y-2">
          <div className="h-6 w-56 animate-pulse rounded bg-slate-300/70 dark:bg-slate-700/70" />
          <div className="h-4 w-full max-w-2xl animate-pulse rounded bg-slate-300/60 dark:bg-slate-800/70" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-32 animate-pulse rounded-xl bg-slate-300/60 dark:bg-slate-800/70"
            />
          ))}
        </div>
      </div>
    </OperationalSectionCard>
  );
}

export function MonitorMetricsFallback() {
  return (
    <OperationalSectionCard className="bg-background/80" contentClassName="space-y-4 p-4">
      <div role="status" aria-live="polite" aria-label="Loading key metrics" className="space-y-4">
        <div className="space-y-2">
          <div className="h-6 w-40 animate-pulse rounded bg-slate-300/70 dark:bg-slate-700/70" />
          <div className="h-4 w-full max-w-xl animate-pulse rounded bg-slate-300/60 dark:bg-slate-800/70" />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-72 animate-pulse rounded-2xl border border-border/60 bg-background/35 backdrop-blur-sm"
            />
          ))}
        </div>
      </div>
    </OperationalSectionCard>
  );
}

export function MonitorSectionCardFallback({
  title,
  blocks = 2,
}: {
  title: string;
  blocks?: number;
}) {
  return (
    <OperationalSectionCard className="bg-background/80" contentClassName="space-y-3 p-4">
      <div role="status" aria-live="polite" aria-label={title} className="space-y-3">
        <div className="h-5 w-40 animate-pulse rounded bg-slate-300/70 dark:bg-slate-700/70" />
        <div className="space-y-3">
          {Array.from({ length: blocks }).map((_, index) => (
            <div
              key={index}
              className="h-20 animate-pulse rounded-xl bg-slate-300/60 dark:bg-slate-800/70"
            />
          ))}
        </div>
      </div>
    </OperationalSectionCard>
  );
}

export function MonitorWebVitalsInlineFallback() {
  return (
    <OperationalSectionCard className="bg-background/80" contentClassName="space-y-3 p-4">
      <div
        role="status"
        aria-live="polite"
        aria-label="Loading real user experience details"
        className="space-y-3"
      >
        <div className="h-5 w-48 animate-pulse rounded bg-slate-300/70 dark:bg-slate-700/70" />
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <div
              key={index}
              className="h-36 animate-pulse rounded-2xl bg-slate-300/60 dark:bg-slate-800/70"
            />
          ))}
        </div>
      </div>
    </OperationalSectionCard>
  );
}

type DeferredMonitorSectionOptions = {
  enabled: boolean;
  rootMargin?: string;
  timeoutMs?: number;
};

export function useDeferredMonitorSectionMount({
  enabled,
  rootMargin = "320px 0px",
  timeoutMs = 1400,
}: DeferredMonitorSectionOptions) {
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

type MonitorDeferredSectionToggleProps = {
  title: string;
  headline?: string;
  description: string;
  statusBadgeLabel?: string;
  statusTone?: "stable" | "watch" | "attention";
  summaryBadges?: ReactNode;
  open: boolean;
  onToggle: () => void;
};

export function MonitorDeferredSectionToggle({
  title,
  headline,
  description,
  statusBadgeLabel,
  statusTone,
  summaryBadges,
  open,
  onToggle,
}: MonitorDeferredSectionToggleProps) {
  const buttonClassName = "flex w-full items-start justify-between gap-3 text-left";

  return (
    <div className="rounded-2xl border border-border/60 bg-background/30 p-4 backdrop-blur-sm">
      {open ? (
        <button
          type="button"
          className={buttonClassName}
          onClick={onToggle}
          aria-expanded="true"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
              {statusBadgeLabel ? (
                <Badge
                  variant="outline"
                  className={`rounded-full px-2.5 py-0.5 text-[10px] ${getMonitorSummaryToneClass(
                    statusTone ?? "stable",
                  )}`}
                >
                  {statusBadgeLabel}
                </Badge>
              ) : null}
              {summaryBadges}
            </div>
            {headline ? <p className="mt-2 text-sm font-semibold text-foreground">{headline}</p> : null}
            <p className={headline ? "mt-1 text-sm text-muted-foreground" : "mt-2 text-sm text-muted-foreground"}>
              {description}
            </p>
          </div>
          <span className="shrink-0 pt-1 text-muted-foreground">
            <ChevronUp className="h-4 w-4" />
          </span>
        </button>
      ) : (
        <button
          type="button"
          className={buttonClassName}
          onClick={onToggle}
          aria-expanded="false"
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">{title}</h2>
              {statusBadgeLabel ? (
                <Badge
                  variant="outline"
                  className={`rounded-full px-2.5 py-0.5 text-[10px] ${getMonitorSummaryToneClass(
                    statusTone ?? "stable",
                  )}`}
                >
                  {statusBadgeLabel}
                </Badge>
              ) : null}
              {summaryBadges}
            </div>
            {headline ? <p className="mt-2 text-sm font-semibold text-foreground">{headline}</p> : null}
            <p className={headline ? "mt-1 text-sm text-muted-foreground" : "mt-2 text-sm text-muted-foreground"}>
              {description}
            </p>
          </div>
          <span className="shrink-0 pt-1 text-muted-foreground">
            <ChevronDown className="h-4 w-4" />
          </span>
        </button>
      )}
    </div>
  );
}
