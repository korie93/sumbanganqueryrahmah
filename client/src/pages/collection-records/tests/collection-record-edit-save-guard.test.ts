import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CollectionRecord } from "@/lib/api";
import { useCollectionRecordEditSaveAction } from "../useCollectionRecordEditSaveAction";

type SaveArgs = Parameters<typeof useCollectionRecordEditSaveAction>[0];

function renderSaveAction(overrides: Partial<SaveArgs> = {}) {
  const errors: unknown[] = [];
  const effects: string[] = [];
  const record: CollectionRecord = {
    id: "synthetic-edit-guard", customerName: "Synthetic Customer",
    icNumber: "00001234", customerPhone: "0123456789", accountNumber: "00004567",
    batch: "P10", paymentDate: "2026-01-01", amount: "100.00",
    collectionStaffNickname: "Synthetic Staff", receipts: [],
    receiptFile: null, receiptTotalAmount: "0.00", receiptValidationStatus: "unverified",
    receiptValidationMessage: null, receiptCount: 0, duplicateReceiptFlag: false,
    createdByLogin: "synthetic-user",
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
  };
  let action: ReturnType<typeof useCollectionRecordEditSaveAction> | undefined;
  function Harness() {
    action = useCollectionRecordEditSaveAction({
      editingRecord: record, customerName: record.customerName, icNumber: record.icNumber,
      customerPhone: record.customerPhone, accountNumber: record.accountNumber,
      batch: record.batch, paymentDate: record.paymentDate, amount: "100.00",
      staffNickname: record.collectionStaffNickname, nicknameOptions: [],
      newReceiptFiles: [], existingReceiptDrafts: [], pendingReceiptDrafts: [], removedReceiptIds: [],
      onRefresh: async () => { effects.push("refresh"); },
      closeDialog: () => { effects.push("close"); },
      resetEditState: () => { effects.push("reset"); },
      notifyMutationError: (error) => { errors.push(error); },
      notifyMutationSuccess: () => { effects.push("success"); },
      ...overrides,
    });
    return null;
  }
  renderToStaticMarkup(createElement(Harness));
  assert.ok(action);
  return { action, errors, effects };
}

test("unchanged and formatting-equivalent edits do not invoke any mutation side effects", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error("Unexpected synthetic network request"); };
  try {
    for (const overrides of [{}, { amount: "100", customerName: " Synthetic Customer " }]) {
      const { action, errors, effects } = renderSaveAction(overrides);
      assert.equal(action.changeReview.hasChanges, false);
      await action.handleSaveEdit();
      assert.deepEqual(errors, []);
      assert.deepEqual(effects, []);
    }
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("invalid drafts start without errors and cannot mutate or show duplicate validation toasts", async () => {
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async () => { requests += 1; throw new Error("Unexpected synthetic network request"); };
  try {
    const { action, errors, effects } = renderSaveAction({ customerName: "", amount: "0" });
    assert.equal(action.changeReview.hasChanges, true);
    assert.equal(action.validationAttempt, 0);
    assert.deepEqual(action.validationErrors, {});
    await action.handleSaveEdit();
    assert.deepEqual(errors, []);
    assert.deepEqual(effects, []);
    assert.equal(requests, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("no selected record cannot become a saveable edit", async () => {
  const { action, errors, effects } = renderSaveAction({ editingRecord: null });
  assert.equal(action.changeReview.hasChanges, false);
  await action.handleSaveEdit();
  assert.deepEqual(errors, []);
  assert.deepEqual(effects, []);
});

test("the dialog and save guard share the review without changing version or idempotency checks", () => {
  const source = readFileSync("client/src/pages/collection-records/useCollectionRecordEditSaveAction.ts", "utf8");
  const edit = readFileSync("client/src/pages/collection-records/useCollectionRecordEdit.ts", "utf8");
  assert.match(edit, /changeReview: saveAction\.changeReview/);
  assert.match(source, /if \(!editingRecord \|\| !changeReview\.hasChanges \|\| savingEdit \|\| savingEditInFlightRef\.current\)/);
  assert.ok(source.indexOf("!changeReview.hasChanges") < source.indexOf("const validationError ="));
  assert.match(source, /expectedUpdatedAt: editingRecord\.updatedAt \|\| editingRecord\.createdAt/);
  assert.match(source, /idempotencyFingerprint: editMutationIntentRef\.current\.fingerprint/);
  assert.match(source, /idempotencyKey: editMutationIntentRef\.current\.key/);
  assert.match(source, /confirmExistingReceiptRemoval\(removeReceiptIds\.length\)/);
});

test("inline feedback is draft-local, derives corrected errors, and retries focus only on invalid Save", () => {
  const source = readFileSync("client/src/pages/collection-records/useCollectionRecordEditSaveAction.ts", "utf8");
  const edit = readFileSync("client/src/pages/collection-records/useCollectionRecordEdit.ts", "utf8");
  assert.match(source, /const \[validationAttempt, setValidationAttempt\] = useState\(0\)/);
  assert.match(source, /const currentValidationErrors = useMemo\(\(\) => getCollectionRecordEditFieldErrors\(/);
  assert.match(source, /validationAttempt > 0 \? currentValidationErrors : EMPTY_VALIDATION_ERRORS/);
  assert.match(source, /if \(validationError\) \{\s+setValidationAttempt\(\(previousAttempt\) => previousAttempt \+ 1\)/);
  assert.equal((source.match(/setValidationAttempt\(\(previousAttempt\) => previousAttempt \+ 1\)/g) || []).length, 1);
  assert.match(source, /const resetEditMutationIntent = useCallback\(\(\) => \{\s+editMutationIntentRef\.current = null;\s+setValidationAttempt\(0\)/);
  assert.match(edit, /validationErrors: saveAction\.validationErrors/);
  assert.match(edit, /validationAttempt: saveAction\.validationAttempt/);
  for (const [start, end] of [
    ["const handleEditDialogOpenChange", "const handleDiscardConfirmOpenChange"],
    ["const handleDiscardChanges", "const openEditDialog"],
    ["const openEditDialog", "const editDialog"],
  ]) {
    const callback = edit.slice(edit.indexOf(start), edit.indexOf(end));
    assert.match(callback, /saveAction\.resetEditMutationIntent\(\)/);
  }
  const continueEdit = edit.slice(edit.indexOf("const handleDiscardConfirmOpenChange"), edit.indexOf("const handleDiscardChanges"));
  assert.doesNotMatch(continueEdit, /resetEditMutationIntent|setValidationAttempt/);
  assert.equal((source.match(/closeDialog\(\);\s+resetEditState\(\);\s+resetEditMutationIntent\(\)/g) || []).length, 2);
});

test("API failures retain the existing toast instead of guessing a field mapping", () => {
  const source = readFileSync("client/src/pages/collection-records/useCollectionRecordEditSaveAction.ts", "utf8");
  const errorHandling = source.slice(source.indexOf("} catch (error: unknown)"), source.indexOf("} finally {"));
  assert.match(errorHandling, /title: "Failed to Update Record"/);
  assert.match(errorHandling, /description: apiErrorDetails\.message/);
  assert.doesNotMatch(errorHandling, /setValidationAttempt|getCollectionRecordEditFieldErrors|validationErrors/);
});
