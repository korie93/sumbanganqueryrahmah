import { normalizeSearchValue } from "./utils";

/** Separate incoming applied-query changes from local typing and our own acknowledgements. */
export function getAccountManagementSearchSync({
  appliedSearch,
  previousAppliedSearch,
  lastSubmittedSearch,
  draftSearch,
  deferredSearch,
}: {
  appliedSearch: string;
  previousAppliedSearch: string;
  lastSubmittedSearch: string | null;
  draftSearch: string;
  deferredSearch: string;
}) {
  const normalizedApplied = normalizeSearchValue(appliedSearch);
  const normalizedDraft = normalizeSearchValue(draftSearch);
  const normalizedDeferred = normalizeSearchValue(deferredSearch);
  const resetDraft = appliedSearch !== previousAppliedSearch
    && (lastSubmittedSearch === null || normalizedApplied !== normalizeSearchValue(lastSubmittedSearch));
  return {
    resetDraft,
    // Never publish the previous deferred value while typing or accepting an external reset.
    publishSearch: resetDraft || normalizedDeferred !== normalizedDraft || normalizedDeferred === normalizedApplied
      ? null
      : normalizedDeferred,
  };
}
