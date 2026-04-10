import { Suspense, lazy } from "react";
import { ViewerEmptyStateFallback } from "@/pages/viewer/ViewerContentFallbacks";

const ViewerEmptyState = lazy(() =>
  import("@/pages/viewer/ViewerEmptyState").then((module) => ({
    default: module.ViewerEmptyState,
  })),
);

type ViewerContentEmptyStateProps = {
  emptyHint: string;
  isSearchBelowMinLength: boolean;
  minSearchLength: number;
};

export function ViewerContentEmptyState({
  emptyHint,
  isSearchBelowMinLength,
  minSearchLength,
}: ViewerContentEmptyStateProps) {
  return (
    <Suspense fallback={<ViewerEmptyStateFallback />}>
      <ViewerEmptyState
        emptyHint={emptyHint}
        isSearchBelowMinLength={isSearchBelowMinLength}
        minSearchLength={minSearchLength}
      />
    </Suspense>
  );
}
