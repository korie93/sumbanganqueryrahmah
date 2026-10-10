type CollectionRecordEditCloseState = {
  hasChanges: boolean;
  savingEdit: boolean;
  discardConfirmed?: boolean;
};

// This governs user dismissals only. A completed save or version conflict keeps
// its existing programmatic close/reset path without prompting to discard.
export function getCollectionRecordEditCloseDecision({
  hasChanges,
  savingEdit,
  discardConfirmed = false,
}: CollectionRecordEditCloseState): "ignore" | "confirm" | "close" {
  if (savingEdit) return "ignore";
  if (hasChanges && !discardConfirmed) return "confirm";
  return "close";
}
