import { Suspense } from "react";
import { lazyWithPreload } from "@/lib/lazy-with-preload";
import { ViewerEmptyStateFallback } from "@/pages/viewer/ViewerContentFallbacks";

const ViewerEmptyState = lazyWithPreload(() =>
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
