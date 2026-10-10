import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createEmptyCollectionReceiptDraft } from "../receipt-validation";
import { getSaveCollectionResetDecision, hasSaveCollectionResettableWork } from "../save-collection-reset-guard";
import type { SaveCollectionFormValues } from "../save-collection-page-utils";

const empty: SaveCollectionFormValues = {
  staffNickname: "Synthetic Collector", customerName: "", icNumber: "", customerPhone: "",
  accountNumber: "", cardNumber: "", batch: "P10", paymentDate: "", amount: "",
};
const pristine = { values: empty, receiptFileCount: 0, receiptDrafts: [], draftRestoreNotice: null };

test("only entered or restored work needs Reset confirmation, not the supplied nickname/default batch", () => {
  assert.equal(hasSaveCollectionResettableWork(pristine), false);
  assert.equal(hasSaveCollectionResettableWork({ ...pristine, values: { ...empty, staffNickname: "Another Staff" } }), false);
  for (const field of ["customerName", "icNumber", "customerPhone", "accountNumber", "cardNumber", "paymentDate", "amount"] as const) {
    for (const input of ["value", " ", "0"]) {
      assert.equal(hasSaveCollectionResettableWork({ ...pristine, values: { ...empty, [field]: input } }), true, `${field}=${input}`);
    }
  }
  assert.equal(hasSaveCollectionResettableWork({ ...pristine, values: { ...empty, batch: "P25" } }), true);
  assert.equal(hasSaveCollectionResettableWork({ ...pristine, receiptFileCount: 1 }), true);
  assert.equal(hasSaveCollectionResettableWork({ ...pristine, receiptDrafts: [createEmptyCollectionReceiptDraft()] }), true);
  assert.equal(hasSaveCollectionResettableWork({ ...pristine, draftRestoreNotice: { restoredAt: "2026-01-01", hadPendingReceipts: true } }), true);
  assert.equal(hasSaveCollectionResettableWork({ ...pristine, draftRestoreNotice: { restoredAt: "2026-01-01", hadPendingReceipts: false } }), false);
});

test("reset policy blocks mutations during save/access suspension and requires explicit confirmation for work", () => {
  for (const hasWork of [false, true]) for (const confirmed of [false, true]) {
    for (const submitting of [false, true]) for (const accessSuspended of [false, true]) {
      assert.equal(getSaveCollectionResetDecision({ hasWork, confirmed, submitting, accessSuspended }),
        submitting || accessSuspended ? "ignore" : hasWork && !confirmed ? "confirm" : "reset");
    }
  }
});

test("cancel only closes confirmation; success reset and mutation intent semantics remain separate", () => {
  const hook = readFileSync(new URL("../useSaveCollectionPageState.ts", import.meta.url), "utf8");
  const cancel = hook.slice(hook.indexOf("const onResetConfirmOpenChange"), hook.indexOf("const confirmReset"));
  assert.match(cancel, /resetConfirmPendingRef\.current = false/);
  assert.doesNotMatch(cancel, /resetForm\(|clearPageState\(|resetSubmitMutationIntent\(/);
  const confirm = hook.slice(hook.indexOf("const confirmReset"), hook.indexOf("const handleSubmit"));
  assert.match(confirm, /if \(!resetConfirmPendingRef\.current\) return/);
  assert.ok(confirm.indexOf("resetConfirmPendingRef.current = false") < confirm.indexOf("resetForm();"));
  const submit = hook.slice(hook.indexOf("const handleSubmit"), hook.indexOf("  return {", hook.indexOf("const handleSubmit")));
  assert.match(submit, /if \(resetConfirmPendingRef\.current \|\| submitActionInFlightRef\.current\) return/);
  assert.match(submit, /finally \{\s+submitActionInFlightRef\.current = false/);
  const rawReset = hook.slice(hook.indexOf("const clearPageState"), hook.indexOf("const submitState"));
  assert.doesNotMatch(rawReset, /Confirm|confirm|resetForm/);
  assert.match(hook, /useSaveCollectionSubmitState\(\{[\s\S]*?clearPageState,/);
});

test("confirmation focus protection targets only its own backdrop and cleans up on close", () => {
  const dialog = readFileSync(new URL("../SaveCollectionResetDialog.tsx", import.meta.url), "utf8");
  assert.match(dialog, /if \(!open\) return/);
  assert.match(dialog, /event\.button === 0 && !event\.ctrlKey/);
  assert.match(dialog, /event\.target\.classList\.contains\("save-collection-reset-overlay"\)/);
  assert.match(dialog, /overlayClassName="save-collection-reset-overlay"/);
  assert.match(dialog, /document\.addEventListener\("pointerdown", preserveBackdropFocus, true\)/);
  assert.match(dialog, /return \(\) => document\.removeEventListener\("pointerdown", preserveBackdropFocus, true\)/);
  assert.match(dialog, /if \(event\.key !== "Escape" \|\| event\.defaultPrevented\) return/);
  assert.match(dialog, /if \(!disabled\) onOpenChange\(false\)/);
});
