type BuildCollectionRecordsPaginationControlsStateArgs = {
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  loadingRecords: boolean;
};

export function buildCollectionRecordsPaginationControlsState({
  hasNextPage,
  hasPreviousPage,
  loadingRecords,
}: BuildCollectionRecordsPaginationControlsStateArgs) {
  return {
    nextDisabled: loadingRecords || !hasNextPage,
    pageSizeDisabled: loadingRecords,
    paginationBusy: loadingRecords,
    previousDisabled: loadingRecords || !hasPreviousPage,
  };
}
