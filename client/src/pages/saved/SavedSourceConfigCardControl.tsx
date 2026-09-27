import { AlertCircle, Database, Loader2, RefreshCw, Settings2 } from "lucide-react";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSavedSourceConfig } from "@/pages/saved/SavedSourceConfigProvider";
import {
  getSavedSourceCompatibilityMessage,
  savedSourceStatusPresentation,
} from "@/pages/saved/saved-source-config-utils";
import type { ImportItem } from "@/pages/saved/types";

export function SavedSourceConfigCardControl({
  disabled,
  item,
  compact = false,
}: {
  disabled: boolean;
  item: ImportItem;
  compact?: boolean;
}) {
  const sourceState = useSavedSourceConfig();
  if (!sourceState.enabled) return null;

  const config = sourceState.configsByImportId.get(item.id) ?? null;
  const status = config ? savedSourceStatusPresentation[config.status] : null;

  if (compact) {
    if (sourceState.loadFailed) {
      return (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>Source status unavailable</p>
          <Button variant="outline" size="sm" className="h-11 md:h-9" onClick={sourceState.refresh}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />Retry status
          </Button>
        </div>
      );
    }
    return (
      <Button
        variant="ghost"
        className="h-auto min-h-11 max-w-full justify-start gap-2 px-2 py-1 text-left md:min-h-9"
        onClick={() => sourceState.openConfig(item)}
        disabled={disabled || sourceState.loading || sourceState.mutationPending}
        aria-label={`${config ? "Edit source" : "Configure source"} for ${item.name}`}
        aria-haspopup="dialog"
        data-testid={`button-configure-source-${item.id}`}
      >
        <Settings2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="min-w-0 whitespace-normal">
          <span className="block text-sm">{sourceState.loading ? "Checking..." : status?.label ?? "Not configured"}</span>
          <span className="block text-xs font-normal text-muted-foreground">
            {sourceState.loading ? "Loading source status" : config?.compatibilityStatus === "compatible"
              ? "Compatible" : config ? "Needs review" : "Configure source"}
          </span>
        </span>
      </Button>
    );
  }

  if (sourceState.loadFailed) {
    return (
      <div className="mt-3 flex flex-col gap-2 border-t border-border/60 pt-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="flex items-start gap-2 text-muted-foreground">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Source status is unavailable. This does not affect the Saved file.
        </p>
        <Button variant="outline" size="sm" className="h-11 w-full md:h-9 sm:w-auto" onClick={sourceState.refresh}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          Retry status
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3 grid gap-2 border-t border-border pt-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Collection source
          </span>
          <span className={cn(
            badgeVariants({ variant: "outline" }),
            status?.toneClassName ?? "border-border bg-muted/45 text-foreground",
          )}>
            {sourceState.loading ? "Checking..." : status?.label ?? "Not configured"}
          </span>
          {!sourceState.loading ? (
            <span className={cn(
              badgeVariants({ variant: "outline" }),
              config?.compatibilityStatus === "compatible"
                ? "border-emerald-300 text-emerald-800 dark:border-emerald-800 dark:text-emerald-200"
                : config
                  ? "border-rose-300 text-rose-800 dark:border-rose-800 dark:text-rose-200"
                  : "border-border text-muted-foreground",
            )}>
              {config?.compatibilityStatus === "compatible"
                ? "Compatible"
                : config
                  ? "Needs review"
                  : "Compatibility pending"}
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
          <span>{sourceState.loading ? "Loading configuration status safely." : getSavedSourceCompatibilityMessage(config)}</span>
          <span className="flex items-center gap-1.5">
            {sourceState.loading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              : <Database className="h-3.5 w-3.5" aria-hidden="true" />}
            {config
              ? `${config.indexedRowCount.toLocaleString()} of ${config.rowCount.toLocaleString()} rows indexed`
              : "No rows indexed yet"}
          </span>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-11 w-full md:h-9 lg:w-auto"
        onClick={() => sourceState.openConfig(item)}
        disabled={disabled || sourceState.loading || sourceState.mutationPending}
        aria-haspopup="dialog"
        data-testid={`button-configure-source-${item.id}`}
      >
        <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
        {config ? "Edit source" : "Configure source"}
      </Button>
    </div>
  );
}
