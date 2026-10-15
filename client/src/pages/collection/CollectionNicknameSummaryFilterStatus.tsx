import {
  formatCollectionNicknameSummaryMobileDateRange,
  hasCollectionNicknameSummaryDraftChanges,
  type CollectionNicknameSummaryFilterSelection,
} from "./collection-nickname-summary-page-utils";

export function CollectionNicknameSummaryFilterStatus({ selection }: {
  selection: CollectionNicknameSummaryFilterSelection;
}) {
  const changed = hasCollectionNicknameSummaryDraftChanges(selection);
  return (
    <p role="status" className="break-words text-xs leading-relaxed text-muted-foreground [overflow-wrap:anywhere]" data-testid="collection-nickname-summary-filter-status">
      {selection.hasApplied ? (
        <>
          {changed ? "Draft changes are not applied. " : "Filters applied. "}
          Showing results for {selection.appliedNicknames.join(", ")} · {formatCollectionNicknameSummaryMobileDateRange(selection.appliedFromDate, selection.appliedToDate)}.
          {changed ? " Choose Apply to update the results." : ""}
        </>
      ) : "Choose staff nicknames and dates, then Apply to load results."}
    </p>
  );
}
