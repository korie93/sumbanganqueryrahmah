export const SAVED_BULK_DELETE_CONCURRENCY = 3;

type SavedBulkDeleteOptions = {
  signal: AbortSignal;
  deleteOne: (id: string, options: { signal: AbortSignal }) => Promise<unknown>;
};

export type SavedBulkDeleteResult = {
  deletedIds: string[];
  failedIds: string[];
};

function assertDeletionOpen(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Saved bulk deletion was aborted.", "AbortError");
  }
}

export async function deleteSavedImports(
  ids: readonly string[],
  { signal, deleteOne }: SavedBulkDeleteOptions,
): Promise<SavedBulkDeleteResult> {
  assertDeletionOpen(signal);
  const targets = [...ids];
  const outcomes = new Array<boolean>(targets.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (!signal.aborted && nextIndex < targets.length) {
      const index = nextIndex++;
      try {
        await deleteOne(targets[index], { signal });
        outcomes[index] = true;
      } catch {
        outcomes[index] = false;
      }
    }
  };

  // Each worker settles its already-started request even after cancellation.
  // No queued request starts once aborted, and no individual failure is retried.
  await Promise.all(Array.from(
    { length: Math.min(SAVED_BULK_DELETE_CONCURRENCY, targets.length) },
    runWorker,
  ));
  assertDeletionOpen(signal);

  const deletedIds: string[] = [];
  const failedIds: string[] = [];
  targets.forEach((id, index) => {
    (outcomes[index] ? deletedIds : failedIds).push(id);
  });
  return { deletedIds, failedIds };
}
