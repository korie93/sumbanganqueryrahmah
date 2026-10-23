import { Eye, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ViewerEmptyStateProps {
  emptyHint: string;
  isSearchBelowMinLength: boolean;
  minSearchLength: number;
  hasActiveRefinement?: boolean | undefined;
  onClearRefinements?: (() => void) | undefined;
}

export function ViewerEmptyState({
  emptyHint,
  isSearchBelowMinLength,
  minSearchLength,
  hasActiveRefinement = false,
  onClearRefinements,
}: ViewerEmptyStateProps) {
  const Icon = hasActiveRefinement ? Search : Eye;

  return (
    <div className="viewer-empty-state" data-testid="viewer-empty-state">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <p className="font-medium text-foreground">
        {isSearchBelowMinLength ? "Teruskan menaip untuk carian" : hasActiveRefinement ? "Tiada hasil carian" : "Tiada data"}
      </p>
      {!hasActiveRefinement && emptyHint ? <p className="mt-2 text-sm text-muted-foreground">{emptyHint}</p> : null}
      {isSearchBelowMinLength ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Masukkan sekurang-kurangnya {minSearchLength} aksara untuk carian.
        </p>
      ) : null}
      {hasActiveRefinement && !isSearchBelowMinLength ? (
        <p className="mt-2 text-sm text-muted-foreground">Cuba kata kunci lain atau kosongkan carian dan filter.</p>
      ) : null}
      {hasActiveRefinement && onClearRefinements ? (
        <Button type="button" variant="outline" className="mt-4" onClick={onClearRefinements}>
          Kosongkan carian dan filter
        </Button>
      ) : null}
    </div>
  );
}
