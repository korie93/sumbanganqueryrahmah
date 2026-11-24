import { parseCollectionAmountToCents } from "@shared/collection-amount-types";
import { COLLECTION_OFFLINE_EXPORT_MAX_RECORDS, type CollectionOfflineExportExpectation } from "@shared/common/collection-offline-export";
import type { CollectionRecord } from "@/lib/api/collection-types";

type SelectionSource = Pick<CollectionRecord, "id" | "customerName" | "amount" | "paymentDate" | "receiptCount" | "receipts" | "receiptFile">;

export type SelectedCollectionRecord = {
  id: string;
  name: string;
  date: string;
  cents: number;
  receipts: number;
};

export type OfflineSelection = {
  items: ReadonlyMap<string, SelectedCollectionRecord>;
  cleared: ReadonlyMap<string, SelectedCollectionRecord> | null;
  limitReached: boolean;
};

export type OfflineEstimate = CollectionOfflineExportExpectation;
export type OfflineReceiptIssue = { recordId: string; receiptNumber: number | null; receiptCount: number };

type SelectionAction =
  | { type: "select"; records: readonly SelectionSource[] }
  | { type: "remove"; ids: readonly string[] }
  | { type: "accept"; estimates: readonly OfflineEstimate[] }
  | { type: "clear" | "undo-clear" | "reset" };

export function emptyOfflineSelection(): OfflineSelection {
  return { items: new Map(), cleared: null, limitReached: false };
}

export function updateOfflineSelection(state: OfflineSelection, action: SelectionAction): OfflineSelection {
  if (action.type === "reset") return emptyOfflineSelection();
  if (action.type === "clear") return state.items.size
    ? { ...emptyOfflineSelection(), cleared: state.items } : state;
  if (action.type === "undo-clear") return state.cleared
    ? { items: state.cleared, cleared: null, limitReached: false } : state;
  const items = new Map(state.items);
  if (action.type === "remove") {
    for (const id of action.ids) items.delete(id);
  } else if (action.type === "accept") {
    for (const estimate of action.estimates) {
      const item = items.get(estimate.id);
      if (item) items.set(estimate.id, { ...item, ...estimate });
    }
  } else if (action.type === "select") {
    for (const record of action.records) {
      if (items.has(record.id)) continue;
      if (items.size === COLLECTION_OFFLINE_EXPORT_MAX_RECORDS) {
        // Select-page is atomic. Keep the previous choice intact if it would exceed the limit.
        return { ...state, limitReached: true };
      }
      items.set(record.id, {
        id: record.id,
        name: record.customerName,
        date: record.paymentDate,
        cents: parseCollectionAmountToCents(record.amount, { allowZero: true }) ?? 0,
        receipts: Math.max(record.receiptCount || 0, record.receipts?.length || 0, record.receiptFile ? 1 : 0),
      });
    }
  }
  return { items, cleared: null, limitReached: false };
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function readOfflineEstimateChanges(details: unknown, items: OfflineSelection["items"]): OfflineEstimate[] {
  if (!details || typeof details !== "object" || !("changes" in details) || !Array.isArray(details.changes)
    || details.changes.length > items.size) return [];
  const accepted = new Map<string, OfflineEstimate>();
  for (const entry of details.changes) {
    if (!entry || typeof entry.id !== "string" || !items.has(entry.id) || accepted.has(entry.id)
      || !nonNegativeInteger(entry.cents) || !nonNegativeInteger(entry.receipts)) return [];
    accepted.set(entry.id, { id: entry.id, cents: entry.cents, receipts: entry.receipts });
  }
  return [...items.keys()].flatMap((id) => accepted.get(id) ?? []);
}

export function readOfflineReceiptIssue(details: unknown, items: OfflineSelection["items"]): OfflineReceiptIssue | null {
  if (!details || typeof details !== "object" || !("recordId" in details) || typeof details.recordId !== "string"
    || !items.has(details.recordId) || !("receiptNumber" in details) || !("receiptCount" in details)
    || !nonNegativeInteger(details.receiptCount)) return null;
  const { recordId, receiptNumber, receiptCount } = details;
  if (receiptNumber !== null && (!nonNegativeInteger(receiptNumber) || receiptNumber < 1 || receiptNumber > receiptCount)) return null;
  return { recordId, receiptNumber, receiptCount };
}

export function getOfflineSelectionTotals(items: ReadonlyMap<string, SelectedCollectionRecord>) {
  let cents = 0;
  let receipts = 0;
  for (const item of items.values()) {
    cents += item.cents;
    receipts += item.receipts;
  }
  return { cents, receipts };
}
