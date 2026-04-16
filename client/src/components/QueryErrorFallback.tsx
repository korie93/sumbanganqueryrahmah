import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type QueryErrorFallbackProps = {
  title: string;
  description: string;
  onRetry?: (() => void) | undefined;
  className?: string | undefined;
  compact?: boolean | undefined;
  "data-testid"?: string | undefined;
};

export function QueryErrorFallback({
  title,
  description,
  onRetry,
  className,
  compact = false,
  "data-testid": dataTestId,
}: QueryErrorFallbackProps) {
  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid={dataTestId}
      className={cn(
        "rounded-xl border border-amber-400/30 bg-amber-500/10 text-amber-950 dark:text-amber-100",
        compact ? "p-4" : "p-5 sm:p-6",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="space-y-1">
            <p className="font-semibold">{title}</p>
            <p className="text-xs leading-5 text-amber-900/80 dark:text-amber-100/80">
              {description}
            </p>
          </div>
          {onRetry ? (
            <Button type="button" size="sm" variant="secondary" onClick={onRetry}>
              <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
              Retry
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
