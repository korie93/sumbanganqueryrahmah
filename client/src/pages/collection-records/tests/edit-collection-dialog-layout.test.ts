import assert from "node:assert/strict";
import test from "node:test";
import { Children, createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Button } from "@/components/ui/button";
import { DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { SelectTrigger } from "@/components/ui/select";
import { CollectionReceiptPanel } from "@/pages/collection/CollectionReceiptPanel";
import { CollectionRecordEditChangeSummary } from "../CollectionRecordEditChangeSummary";
import { CollectionRecordDiscardDialog } from "../CollectionRecordDiscardDialog";
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
  "aria-invalid"?: boolean;
  buttonId?: string;
  onClick?: () => void;
  onCloseAutoFocus?: (event: Event) => void;
  onKeyDown?: (event: { key: string; defaultPrevented: boolean; preventDefault: () => void; stopPropagation: () => void }) => void;
  onPointerDownOutside?: (event: { detail: { originalEvent: { button: number; ctrlKey: boolean; preventDefault: () => void } } }) => void;
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
    validationErrors: {},
    validationAttempt: 0,
    discardConfirmOpen: false,
    onDiscardConfirmOpenChange: noop,
    onDiscardChanges: noop,
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

test("discard confirmation stays separate from edit scrolling and uses guarded callbacks", () => {
  const onOpenChange = () => undefined;
  const onDiscard = () => undefined;
  const root = EditCollectionRecordDialog(fixture({
    discardConfirmOpen: true,
    onDiscardConfirmOpenChange: onOpenChange,
    onDiscardChanges: onDiscard,
  }));
  const [content, confirm] = elements(root.props.children);
  assert.equal(content.type, DialogContent);
  assert.equal(confirm.type, CollectionRecordDiscardDialog);
  const props = confirm.props as {
    open: boolean; saving: boolean; onOpenChange: typeof onOpenChange; onDiscard: typeof onDiscard;
  };
  assert.equal(props.open, true);
  assert.equal(props.saving, false);
  assert.equal(props.onOpenChange, onOpenChange);
  assert.equal(props.onDiscard, onDiscard);
  assert.equal(descendants(content).some((element) => element.type === CollectionRecordDiscardDialog), false);
});

test("dirty primary outside dismissal prevents native focus stealing without changing pristine or context clicks", () => {
  for (const dirty of [false, true]) for (const saving of [false, true]) {
    const { content } = dialogParts(fixture({
      changeReview: { hasChanges: dirty, changes: [] }, savingEdit: saving,
    }));
    for (const pointer of [{ button: 0, ctrlKey: false }, { button: 2, ctrlKey: false }, { button: 0, ctrlKey: true }]) {
      let prevented = 0;
      content.props.onPointerDownOutside?.({ detail: { originalEvent: {
        ...pointer, preventDefault: () => { prevented += 1; },
      } } });
      assert.equal(prevented, dirty && !saving && pointer.button === 0 && !pointer.ctrlKey ? 1 : 0);
    }
  }
});

test("edit validation links every field error to its own control including date and selects", () => {
  const validationErrors = {
    customerName: "Customer Name is required.",
    icNumber: "IC Number is required.",
    customerPhone: "Customer Phone Number is invalid.",
    accountNumber: "Account Number or a previously matched Card Number is required.",
    batch: "Batch is not valid.",
    paymentDate: "Payment Date cannot be in the future.",
    amount: "Amount must be greater than 0.",
    staffNickname: "Sila pilih Staff Nickname rasmi daripada senarai.",
  };
  const { body } = dialogParts(fixture({ validationErrors, validationAttempt: 1 }));
  const children = descendants(body);
  const controls = children.filter((element) => [Input, SelectTrigger, DatePickerField].includes(element.type as typeof Input));
  assert.equal(controls.length, 8);
  assert.equal(body.props.id, "edit-collection-fields");
  const messages = Object.values(validationErrors);
  for (const [index, control] of controls.entries()) {
    assert.equal(control.props["aria-invalid"], true);
    assert.match(control.props.className ?? "", /aria-invalid:border-destructive/);
    assert.ok(control.props.className?.includes("aria-invalid:[--dm-input-border:hsl(var(--destructive))]"));
    const message = children.find((element) => element.props.id === control.props["aria-describedby"]);
    assert.ok(message);
    assert.equal(message.type, "p");
    assert.equal(message.props.children, messages[index]);
    assert.match(message.props.className ?? "", /text-destructive/);
  }
});

test("pristine and corrected edit fields have no error text or invalid ARIA state", () => {
  for (const validationErrors of [{}, { amount: "Amount must be greater than 0." }]) {
    const { body } = dialogParts(fixture({ validationErrors }));
    const children = descendants(body);
    const inputs = children.filter((element) => element.type === Input);
    for (const input of inputs) {
      const invalidAmount = input.props.id === "edit-collection-amount" && "amount" in validationErrors;
      assert.equal(input.props["aria-invalid"], invalidAmount ? true : undefined);
      assert.equal(input.props["aria-describedby"], invalidAmount ? "edit-collection-amount-error" : undefined);
    }
    assert.equal(children.filter((element) => element.type === "p" && element.props.id?.endsWith("-error")).length, Object.keys(validationErrors).length);
  }
});

test("discard confirmation handles only unhandled Escape and never discards or closes while saving", () => {
  for (const saving of [false, true]) {
    let root: ReactElement<ElementProps> | undefined;
    const changed: boolean[] = [];
    let discarded = 0;
    function Harness() {
      root = CollectionRecordDiscardDialog({
        open: true, saving,
        onOpenChange: (open) => { changed.push(open); },
        onDiscard: () => { discarded += 1; },
      });
      return null;
    }
    renderToStaticMarkup(createElement(Harness));
    assert.ok(root);
    const content = elements(root.props.children)[0];
    assert.ok(content.props.onKeyDown);
    for (const key of ["Enter", "Escape"]) for (const defaultPrevented of [false, true]) {
      changed.length = 0;
      let prevented = 0;
      let stopped = 0;
      content.props.onKeyDown({
        key, defaultPrevented,
        preventDefault: () => { prevented += 1; },
        stopPropagation: () => { stopped += 1; },
      });
      const handles = key === "Escape" && !defaultPrevented;
      assert.equal(prevented, handles ? 1 : 0);
      assert.equal(stopped, handles ? 1 : 0);
      assert.deepEqual(changed, handles && !saving ? [false] : []);
      assert.equal(discarded, 0);
    }
  }
});
