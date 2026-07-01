import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("saved mutation state only finalizes the active mutation request", async () => {
  const source = await readFile(new URL("./useSavedMutationState.ts", import.meta.url), "utf8");

  assert.match(
    source,
    /const isActiveMutationRequest = useCallback\(\(\s*controller: AbortController,\s*requestId: number,\s*controllerRef: MutableRefObject<AbortController \| null>,\s*\) => \(\s*mountedRef\.current\s*&& !controller\.signal\.aborted\s*&& controllerRef\.current === controller\s*&& requestId === mutationRequestIdRef\.current\s*\), \[\]\);/s,
  );
  assert.match(
    source,
    /await renameImport\(selectedImport\.id, trimmedName, \{ signal: controller\.signal \}\);\s*if \(!isActiveMutationRequest\(controller, requestId, renameAbortControllerRef\)\) \{\s*return;\s*\}/s,
  );
  assert.match(
    source,
    /await deleteImport\(targetImport\.id, \{ signal: controller\.signal \}\);\s*if \(!isActiveMutationRequest\(controller, requestId, deleteAbortControllerRef\)\) \{\s*return;\s*\}/s,
  );
  assert.match(
    source,
    /const results = await Promise\.allSettled\(ids\.map\(\(id\) => deleteImport\(id, \{ signal: controller\.signal \}\)\)\);\s*if \(!isActiveMutationRequest\(controller, requestId, bulkDeleteAbortControllerRef\)\) \{\s*return;\s*\}/s,
  );
});

test("saved mutation finally blocks do not close dialogs from stale requests", async () => {
  const source = await readFile(new URL("./useSavedMutationState.ts", import.meta.url), "utf8");

  assert.match(
    source,
    /const shouldFinalizeRename = isActiveMutationRequest\(\s*controller,\s*requestId,\s*renameAbortControllerRef,\s*\);[\s\S]*?if \(shouldFinalizeRename\) \{\s*setRenaming\(false\);\s*setRenameDialogOpen\(false\);\s*setSelectedImport\(null\);\s*setNewName\(""\);/s,
  );
  assert.match(
    source,
    /const shouldFinalizeDelete = isActiveMutationRequest\(\s*controller,\s*requestId,\s*deleteAbortControllerRef,\s*\);[\s\S]*?if \(shouldFinalizeDelete\) \{\s*setDeleting\(false\);\s*setDeleteDialogOpen\(false\);\s*setSelectedImport\(null\);/s,
  );
  assert.match(
    source,
    /const shouldFinalizeBulkDelete = isActiveMutationRequest\(\s*controller,\s*requestId,\s*bulkDeleteAbortControllerRef,\s*\);[\s\S]*?if \(shouldFinalizeBulkDelete\) \{\s*setBulkDeleting\(false\);\s*setBulkDeleteDialogOpen\(false\);/s,
  );
  assert.doesNotMatch(source, /finally \{[\s\S]{0,220}if \(mountedRef\.current\) \{/);
});
