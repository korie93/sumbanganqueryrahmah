import { ViewerEmptyState } from "@/pages/viewer/ViewerEmptyState";

type ViewerContentEmptyStateProps = {
  emptyHint: string;
  isSearchBelowMinLength: boolean;
  minSearchLength: number;
  hasActiveRefinement?: boolean | undefined;
  onClearRefinements?: (() => void) | undefined;
};

export function ViewerContentEmptyState({
  emptyHint,
  isSearchBelowMinLength,
  minSearchLength,
  hasActiveRefinement,
  onClearRefinements,
}: ViewerContentEmptyStateProps) {
  return (
    <ViewerEmptyState
      emptyHint={emptyHint}
      isSearchBelowMinLength={isSearchBelowMinLength}
      minSearchLength={minSearchLength}
      hasActiveRefinement={hasActiveRefinement}
      onClearRefinements={onClearRefinements}
    />
  );
}
