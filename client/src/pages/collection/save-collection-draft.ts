import type { CollectionBatch } from "@/lib/api";
import { COLLECTION_BATCH_OPTIONS } from "@/pages/collection/utils";

export type SaveCollectionDraft = {
  customerName: string;
  icNumber: string;
  customerPhone: string;
  accountNumber: string;
  batch: CollectionBatch;
  paymentDate: string;
  amount: string;
  hadPendingReceipts: boolean;
  savedAt: string;
};

function normalizeDraftString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function buildSaveCollectionDraftStorageKey(staffNickname: string): string {
  const normalized = staffNickname
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `save-collection-draft:${normalized || "default"}:v1`;
}

export function isSaveCollectionDraftEmpty(draft: Omit<SaveCollectionDraft, "savedAt">): boolean {
  return !draft.customerName.trim()
    && !draft.icNumber.trim()
    && !draft.customerPhone.trim()
    && !draft.accountNumber.trim()
    && !draft.paymentDate.trim()
    && !draft.amount.trim()
    && draft.batch === "P10"
    && !draft.hadPendingReceipts;
}

export function parseSaveCollectionDraft(raw: string | null | undefined): SaveCollectionDraft | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SaveCollectionDraft>;
    const batchCandidate = normalizeDraftString(parsed.batch);
    const batch = COLLECTION_BATCH_OPTIONS.includes(batchCandidate as CollectionBatch)
      ? batchCandidate as CollectionBatch
      : "P10";

    return {
      customerName: normalizeDraftString(parsed.customerName),
      icNumber: normalizeDraftString(parsed.icNumber),
      customerPhone: normalizeDraftString(parsed.customerPhone),
      accountNumber: normalizeDraftString(parsed.accountNumber),
      batch,
      paymentDate: normalizeDraftString(parsed.paymentDate),
      amount: normalizeDraftString(parsed.amount),
      hadPendingReceipts: Boolean(parsed.hadPendingReceipts),
      savedAt: normalizeDraftString(parsed.savedAt),
    };
  } catch {
    return null;
  }
}

export function readSaveCollectionDraft(staffNickname: string): SaveCollectionDraft | null {
  if (typeof sessionStorage === "undefined") {
    return null;
  }

  return parseSaveCollectionDraft(
    sessionStorage.getItem(buildSaveCollectionDraftStorageKey(staffNickname)),
  );
}

export function clearSaveCollectionDraft(staffNickname: string) {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  sessionStorage.removeItem(buildSaveCollectionDraftStorageKey(staffNickname));
}

export function persistSaveCollectionDraft(
  staffNickname: string,
  draft: Omit<SaveCollectionDraft, "savedAt">,
) {
  if (typeof sessionStorage === "undefined") {
    return;
  }

  const storageKey = buildSaveCollectionDraftStorageKey(staffNickname);
  if (isSaveCollectionDraftEmpty(draft)) {
    sessionStorage.removeItem(storageKey);
    return;
  }

  const payload: SaveCollectionDraft = {
    ...draft,
    savedAt: new Date().toISOString(),
  };
  sessionStorage.setItem(storageKey, JSON.stringify(payload));
}
