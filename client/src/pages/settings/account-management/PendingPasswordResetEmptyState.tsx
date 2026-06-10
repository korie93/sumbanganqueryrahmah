import { LifeBuoy, LoaderCircle, SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PendingResetEmptyStateContent } from "@/pages/settings/account-management/pending-reset-shared";

type PendingPasswordResetEmptyStateProps = {
  state: PendingResetEmptyStateContent;
  onClearFilters?: (() => void) | undefined;
};

function resolveEmptyStateIcon(state: PendingResetEmptyStateContent) {
  if (state.title.startsWith("Loading")) {
    return LoaderCircle;
  }
  if (state.actionLabel) {
    return SearchX;
  }
  return LifeBuoy;
}

export function PendingPasswordResetEmptyState({
  state,
  onClearFilters,
}: PendingPasswordResetEmptyStateProps) {
  const Icon = resolveEmptyStateIcon(state);
  const isLoading = state.title.startsWith("Loading");

  return (
    <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border/70 bg-muted/30 text-muted-foreground">
        <Icon className={`h-5 w-5 ${isLoading ? "animate-spin" : ""}`} />
      </div>
      <div className="max-w-md space-y-1">
        <p className="font-medium text-foreground">{state.title}</p>
        <p className="text-sm text-muted-foreground">{state.description}</p>
      </div>
      {state.actionLabel && onClearFilters ? (
        <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
          {state.actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
