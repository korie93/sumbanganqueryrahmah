import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { getCollectionRecordEditCloseDecision } from "../collection-record-edit-close-policy";

test("unchanged or reverted edits close without a discard confirmation", () => {
  assert.equal(getCollectionRecordEditCloseDecision({ hasChanges: false, savingEdit: false }), "close");
});

test("changed fields or receipt drafts require confirmation before user close", () => {
  assert.equal(getCollectionRecordEditCloseDecision({ hasChanges: true, savingEdit: false }), "confirm");
});

test("explicit discard can close a changed or already reverted draft", () => {
  for (const hasChanges of [false, true]) {
    assert.equal(getCollectionRecordEditCloseDecision({
      hasChanges, savingEdit: false, discardConfirmed: true,
    }), "close");
  }
});

test("saving blocks all user close requests, including a stale discard confirmation", () => {
  for (const hasChanges of [false, true]) {
    for (const discardConfirmed of [false, true]) {
      assert.equal(getCollectionRecordEditCloseDecision({
        hasChanges, savingEdit: true, discardConfirmed,
      }), "ignore");
    }
  }
});

test("the hook shares meaningful-change detection and keeps continue separate from reset", () => {
  const source = readFileSync("client/src/pages/collection-records/useCollectionRecordEdit.ts", "utf8");
  assert.match(source, /hasChanges: saveAction\.changeReview\.hasChanges/);
  assert.match(source, /onDiscardConfirmOpenChange: handleDiscardConfirmOpenChange/);
  assert.match(source, /onDiscardChanges: handleDiscardChanges/);
  const continueEdit = source.slice(
    source.indexOf("const handleDiscardConfirmOpenChange"),
    source.indexOf("const handleDiscardChanges"),
  );
  assert.match(continueEdit, /setDiscardConfirmOpen\(false\)/);
  assert.doesNotMatch(continueEdit, /resetEditState|resetReceiptState|resetEditMutationIntent|setEditOpen/);
  const discard = source.slice(source.indexOf("const handleDiscardChanges"), source.indexOf("const openEditDialog"));
  assert.match(discard, /if \(!discardConfirmOpen\) return/);
  assert.match(discard, /discardConfirmed: true/);
  assert.match(discard, /if \(decision !== "close"\) return/);
  assert.match(discard, /closeEditDialog\(\);\s+resetEditState\(\);\s+saveAction\.resetEditMutationIntent\(\)/);
});

test("success and conflict retain a direct programmatic close path and clear confirmation", () => {
  const source = readFileSync("client/src/pages/collection-records/useCollectionRecordEdit.ts", "utf8");
  const saveSource = readFileSync("client/src/pages/collection-records/useCollectionRecordEditSaveAction.ts", "utf8");
  assert.match(source, /closeDialog: closeEditDialog/);
  for (const callback of ["closeEditDialog", "resetEditState", "openEditDialog"]) {
    const body = source.slice(source.indexOf(`const ${callback} = useCallback`));
    assert.match(body.split("}, [")[0], /setDiscardConfirmOpen\(false\)/);
  }
  const directClose = source.slice(source.indexOf("const closeEditDialog"), source.indexOf("const resetEditState"));
  assert.match(directClose, /setEditOpen\(false\)/);
  assert.doesNotMatch(directClose, /getCollectionRecordEditCloseDecision|hasChanges/);
  assert.equal((saveSource.match(/closeDialog\(\);\s+resetEditState\(\);\s+resetEditMutationIntent\(\)/g) || []).length, 2);
});
