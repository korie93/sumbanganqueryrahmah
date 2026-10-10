import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { CollectionReceiptPanel } from "@/pages/collection/CollectionReceiptPanel";
import { CollectionRecordEditChangeSummary } from "../CollectionRecordEditChangeSummary";
import {
  EditCollectionRecordDialog,
  type EditCollectionRecordDialogProps,
} from "../EditCollectionRecordDialog";

type ElementProps = {
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  id?: string;
  role?: string;
  "aria-describedby"?: string;
  onClick?: () => void;
  onCloseAutoFocus?: (event: Event) => void;
};

function elements(children: ReactNode): ReactElement<ElementProps>[] {
  return Children.toArray(children).filter(isValidElement<ElementProps>);
}

function descendants(element: ReactElement<ElementProps>): ReactElement<ElementProps>[] {
  return [element, ...elements(element.props.children).flatMap(descendants)];
}

function fixture(overrides: Partial<EditCollectionRecordDialogProps> = {}): EditCollectionRecordDialogProps {
  const noop = () => undefined;
  return {
    open: true,
    savingEdit: false,
    changeReview: {
      hasChanges: true,
      changes: [{ key: "customerName", label: "Customer Name", before: "Original Customer", after: "Customer One" }],
    },
    loadingNicknames: false,
    editingRecord: null,
    canManageManualSettlement: false,
    nicknameOptions: [],
    batchOptions: ["P10"],
    editCustomerName: "Customer One",
    editIcNumber: "900101101010",
    editCustomerPhone: "0123456789",
    editAccountNumber: "ACC-1001",
    editBatch: "P10",
    editPaymentDate: "2026-10-01",
    maxPaymentDate: "2026-10-05",
    editAmount: "120.50",
    editStaffNickname: "staff-a",
    editNewReceiptFiles: [],
    editExistingReceiptDrafts: [],
    editPendingReceiptDrafts: [],
    editRemovedReceiptIds: [],
    editReceiptInputRef: { current: null },
    onOpenChange: noop,
    onCustomerNameChange: noop,
    onIcNumberChange: noop,
    onCustomerPhoneChange: noop,
    onAccountNumberChange: noop,
    onBatchChange: noop,
    onPaymentDateChange: noop,
    onAmountChange: noop,
    onStaffNicknameChange: noop,
    onReceiptChange: noop,
    onRemovePendingReceipt: noop,
    onClearPendingReceipts: noop,
    onExistingReceiptDraftChange: noop,
    onPendingReceiptDraftChange: noop,
    onToggleRemoveExistingReceipt: noop,
    onViewExistingReceipt: noop,
    onSave: noop,
    onManualSettlementChanged: noop,
    ...overrides,
  };
}

function dialogParts(props = fixture()) {
  const root = EditCollectionRecordDialog(props);
  const content = elements(root.props.children)[0];
  assert.equal(content.type, DialogContent);
  const [header, body, footer] = elements(content.props.children);
  return { content, header, body, footer };
}

test("edit collection keeps the title and actions outside a single shrinking scroll body", () => {
  const { content, header, body, footer } = dialogParts();
  assert.match(content.props.className ?? "", /\bflex\b.*\bflex-col\b.*\boverflow-hidden\b/);
  assert.match(content.props.className ?? "", /\bmax-w-4xl\b/);
  // Keep the shared DialogContent viewport limit; do not introduce fixed-height overrides.
  assert.doesNotMatch(content.props.className ?? "", /(?:^|\s)(?:\w+:)?(?:max-h-|h-|overflow-auto|overflow-y-auto)/);
  assert.equal(header.type, DialogHeader);
  assert.equal(footer.type, DialogFooter);
  for (const stationary of [header, footer]) {
    assert.match(stationary.props.className ?? "", /\bshrink-0\b/);
    assert.doesNotMatch(stationary.props.className ?? "", /overflow-/);
  }
  assert.equal(body.type, "div");
  assert.match(body.props.className ?? "", /\bmin-h-0\b/);
  assert.match(body.props.className ?? "", /\bflex-1\b/);
  // Explicit minmax(0, 1fr) avoids an implicit min-content column for long receipt names.
  assert.match(body.props.className ?? "", /\bgrid-cols-1\b/);
  assert.match(body.props.className ?? "", /\boverflow-y-auto\b/);
  assert.match(body.props.className ?? "", /\boverscroll-contain\b/);
  assert.equal(descendants(body).filter((element) => element.type === Input).length, 5);
  assert.equal(descendants(body).filter((element) => element.type === CollectionReceiptPanel).length, 1);
  const bodyChildren = elements(body.props.children);
  assert.equal(bodyChildren[bodyChildren.length - 1]?.type, CollectionRecordEditChangeSummary);
  assert.equal(descendants(footer).filter((element) => element.type === CollectionRecordEditChangeSummary).length, 0);
  assert.equal(descendants(body).filter((element) => element.type === DialogFooter).length, 0);
});

test("edit collection preserves Save, Cancel and launcher focus callbacks in the stationary footer", () => {
  let saved = 0;
  const closed: boolean[] = [];
  const restoreFocus = () => undefined;
  const { content, footer } = dialogParts(fixture({
    onSave: () => { saved += 1; },
    onOpenChange: (open) => { closed.push(open); },
    onCloseAutoFocus: restoreFocus,
  }));
  const [cancel, save] = elements(footer.props.children);
  assert.equal(cancel.type, Button);
  assert.equal(save.type, Button);
  assert.equal(content.props.onCloseAutoFocus, restoreFocus);
  assert.equal(cancel.props.children, "Cancel");
  assert.equal(save.props.children, "Save");
  assert.equal(save.props["aria-describedby"], undefined);
  assert.match(footer.props.className ?? "", /\bflex-row\b/);
  for (const action of [cancel, save]) {
    assert.match(action.props.className ?? "", /\bmin-h-11\b/);
    assert.match(action.props.className ?? "", /\bflex-1\b/);
    assert.equal(action.props.disabled, false);
  }
  save.props.onClick?.();
  cancel.props.onClick?.();
  assert.equal(saved, 1);
  assert.deepEqual(closed, [false]);
});

test("saving collection still disables both footer actions and all editable input fields", () => {
  const { body, footer } = dialogParts(fixture({ savingEdit: true }));
  const actions = elements(footer.props.children).filter((element) => element.type === Button);
  for (const action of actions) assert.equal(action.props.disabled, true);
  assert.equal(actions[1].props.children, "Saving...");
  const reason = elements(footer.props.children).find((element) => element.type === "p");
  assert.ok(reason);
  assert.equal(reason.props.children, "Changes are being saved. Please wait before saving again.");
  assert.equal(reason.props.role, "status");
  assert.equal(actions[1].props["aria-describedby"], reason.props.id);
  assert.match(reason.props.className ?? "", /\bw-full\b/);
  assert.doesNotMatch(reason.props.className ?? "", /sr-only/);
  assert.match(footer.props.className ?? "", /\bflex-wrap\b/);
  for (const field of descendants(body).filter((element) => element.type === Input)) {
    assert.equal(field.props.disabled, true);
  }
  const receipts = descendants(body).find((element) => element.type === CollectionReceiptPanel);
  assert.ok(receipts);
  assert.equal(receipts.props.disabled, true);
});

test("an unchanged collection disables Save with a visible reason while Cancel remains available", () => {
  const closed: boolean[] = [];
  const { footer } = dialogParts(fixture({
    changeReview: { hasChanges: false, changes: [] },
    onOpenChange: (open) => { closed.push(open); },
  }));
  const [reason, cancel, save] = elements(footer.props.children);
  assert.equal(reason.type, "p");
  assert.equal(reason.props.children, "Tiada perubahan untuk disimpan.");
  assert.doesNotMatch(reason.props.className ?? "", /sr-only/);
  assert.equal(reason.props.role, undefined);
  assert.equal(save.props["aria-describedby"], reason.props.id);
  assert.equal(save.props.children, "Save");
  assert.equal(save.props.disabled, true);
  assert.equal(cancel.props.disabled, false);
  cancel.props.onClick?.();
  assert.deepEqual(closed, [false]);
});

test("the saving status takes priority over the no-change reason", () => {
  const { footer } = dialogParts(fixture({
    savingEdit: true,
    changeReview: { hasChanges: false, changes: [] },
  }));
  const [reason, cancel, save] = elements(footer.props.children);
  assert.equal(reason.props.children, "Changes are being saved. Please wait before saving again.");
  assert.equal(reason.props.role, "status");
  assert.equal(save.props["aria-describedby"], reason.props.id);
  assert.equal(save.props.children, "Saving...");
  assert.equal(cancel.props.disabled, true);
  assert.equal(save.props.disabled, true);
});
