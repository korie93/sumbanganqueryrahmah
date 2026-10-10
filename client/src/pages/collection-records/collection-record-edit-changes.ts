import type { CollectionBatch, CollectionRecord } from "@/lib/api";
import type { CollectionReceiptDraftInput } from "@/pages/collection/receipt-validation";
import { formatCollectionAmountFromCents, parseCollectionAmountToCents } from "@shared/collection-amount-types";

export type CollectionRecordEditChange = {
  key: string;
  label: string;
  before: string;
  after: string;
};

export type CollectionRecordEditChanges = {
  hasChanges: boolean;
  changes: CollectionRecordEditChange[];
};

type CollectionRecordEditChangesArgs = {
  editingRecord: CollectionRecord | null;
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  batch: CollectionBatch;
  paymentDate: string;
  amount: string;
  staffNickname: string;
  newReceiptFiles: readonly Pick<File, "name">[];
  existingReceiptDrafts: readonly CollectionReceiptDraftInput[];
  pendingReceiptDrafts: readonly CollectionReceiptDraftInput[];
  removedReceiptIds: readonly string[];
};

const textValue = (value: string | null | undefined) => (value ?? "").trim();
const displayText = (value: string) => value || "—";

function moneyValue(value: string | null | undefined) {
  const raw = textValue(value);
  const cents = parseCollectionAmountToCents(raw, { allowZero: true });
  // Invalid text must remain distinct from missing/zero so the unchanged guard
  // cannot swallow an edit that needs the existing validation error.
  return cents === null
    ? { key: `raw:${raw}`, label: displayText(raw) }
    : { key: `cents:${cents}`, label: `RM ${formatCollectionAmountFromCents(cents)}` };
}

/** Compare only editable values, never cached status, OCR output or file paths. */
export function buildCollectionRecordEditChanges(args: CollectionRecordEditChangesArgs): CollectionRecordEditChanges {
  const record = args.editingRecord;
  if (!record) return { hasChanges: false, changes: [] };
  const changes: CollectionRecordEditChange[] = [];
  const addText = (key: string, label: string, before: string | null | undefined, after: string | null | undefined) => {
    const previous = textValue(before);
    const next = textValue(after);
    if (previous !== next) changes.push({ key, label, before: displayText(previous), after: displayText(next) });
  };
  const addMoney = (key: string, label: string, before: string | null | undefined, after: string | null | undefined) => {
    const previous = moneyValue(before);
    const next = moneyValue(after);
    if (previous.key !== next.key) changes.push({ key, label, before: previous.label, after: next.label });
  };

  addText("customerName", "Customer Name", record.customerName, args.customerName);
  addText("icNumber", "IC Number", record.icNumber, args.icNumber);
  addText("customerPhone", "Customer Phone Number", record.customerPhone, args.customerPhone);
  addText("accountNumber", "Account Number", record.accountNumber, args.accountNumber);
  addText("batch", "Batch", record.batch, args.batch);
  addText("paymentDate", "Payment Date", record.paymentDate, args.paymentDate);
  addMoney("amount", "Amount (RM)", record.amount, args.amount);
  addText("staffNickname", "Staff Nickname", record.collectionStaffNickname, args.staffNickname);

  const removedIds = new Set(args.removedReceiptIds.map(textValue));
  const draftsById = new Map(args.existingReceiptDrafts.map((draft) => [draft.receiptId, draft]));
  for (const receipt of record.receipts) {
    const prefix = `receipt:${receipt.id}`;
    const label = receipt.originalFileName || "Receipt";
    if (removedIds.has(receipt.id)) {
      changes.push({ key: `${prefix}:removed`, label: "Receipt dibuang", before: label, after: "—" });
      continue;
    }
    const draft = draftsById.get(receipt.id);
    if (!draft) continue; // Missing metadata is not a removal or an edit.
    addMoney(`${prefix}:amount`, `${label} · Amount`, receipt.receiptAmount, draft.receiptAmount);
    addText(`${prefix}:date`, `${label} · Date`, receipt.receiptDate, draft.receiptDate);
    addText(`${prefix}:reference`, `${label} · Reference`, receipt.receiptReference, draft.receiptReference);
  }

  // Files determine additions. A metadata draft alone cannot upload a receipt.
  args.newReceiptFiles.forEach((file, index) => {
    const prefix = `new-receipt:${index}`;
    const label = file.name || `Receipt ${index + 1}`;
    changes.push({ key: `${prefix}:added`, label: "Receipt ditambah", before: "—", after: label });
    const draft = args.pendingReceiptDrafts[index];
    if (!draft) return;
    addMoney(`${prefix}:amount`, `${label} · Amount`, "", draft.receiptAmount);
    addText(`${prefix}:date`, `${label} · Date`, "", draft.receiptDate);
    addText(`${prefix}:reference`, `${label} · Reference`, "", draft.receiptReference);
  });

  return { hasChanges: changes.length > 0, changes };
}
